import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { quarantineFailedAsset } from "../common/failed_assets";
import { compactDateStamp, dateFolderName, jsonTimestamp } from "../common/time";
import { appendAutomationLog } from "../common/logging";
import { sidecarPathForImage } from "../common/sidecars";
import { embedXmpMetadata } from "../embed_metadata";
import {
  AUTOMATION_LOG_PATH,
  DATA_DIR,
  DOWNLOADS_DIR,
  IMAGE_REGISTRY_PATH,
  LOGS_DIR,
  ROOT,
  SESSION_STATE_PATH,
  STAGING_DIR,
  UPSCALER_STATE_PATH,
} from "../project_paths";

type JsonRecord = Record<string, unknown>;

type RegistryEntry = {
  source: "ai_generated" | "manual";
  final_name: string;
  original_name: string;
  source_path: string;
  dimensions: { width: number; height: number } | null;
  long_side: number | null;
  assigned_scale: number | "copy_only" | "low_res";
  metadata_sidecar: string;
  upscaled: boolean;
  upscaled_path: string | null;
  upscaled_dimensions: { width: number; height: number } | null;
  registered_at: string;
  upscaled_at: string | null;
  adobe_stock_status: string;
  xmp_embed_status?: string | null;
  xmp_embedded_at?: string | null;
  xmp_embed_detail?: string | null;
  quality_flag?: string;
  trend_topic?: string | null;
  series_slot?: string | null;
  prompt_id?: number | null;
  media_name?: string | null;
};

type RegistryFile = {
  last_updated: string;
  total_images: number;
  images: Record<string, RegistryEntry>;
};

type UpscalerState = {
  cli_binary_path?: string | null;
  models_dir?: string | null;
  model_name?: string | null;
  method?: string | null;
};

type SessionDownload = {
  saved_path?: string | null;
};

type SessionState = {
  downloaded_images?: SessionDownload[];
};

type RunMode = "batch" | "fifo";

type CliArgs = {
  mode: RunMode;
  image: string | null;
};

const UPSCALER_LOG_PATH = AUTOMATION_LOG_PATH;
const MANUAL_DIR = path.join(DOWNLOADS_DIR, "manual");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"]);
const EXCLUDED_DIRS = new Set(["failed", "upscaled", "staging"]);
const MANUAL_NAME_RE = /^manual_[a-z0-9_]+_M\d{3}_\d{8}\.[a-z0-9]+$/i;
const DATE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseArgs(): CliArgs {
  let mode: RunMode = "batch";
  let image: string | null = null;

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--mode=")) {
      const value = arg.split("=", 2)[1]?.trim().toLowerCase();
      if (value === "fifo" || value === "batch") {
        mode = value;
      }
      continue;
    }
    if (arg.startsWith("--image=")) {
      const raw = arg.split("=", 2)[1]?.trim();
      if (raw) {
        image = raw.replace(/^"(.*)"$/, "$1");
      }
    }
  }

  return { mode, image };
}

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendLog(message: string): void {
  appendAutomationLog(message);
}

function appendUpscalerLog(message: string): void {
  appendAutomationLog(message);
}

function streamProcessOutput(stream: NodeJS.ReadableStream | null, onLine: (line: string) => void): Promise<void> {
  return new Promise((resolve) => {
    if (!stream) {
      resolve();
      return;
    }

    let buffer = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      buffer += chunk;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trimEnd();
        if (line) {
          onLine(line);
        }
      }
    });
    stream.on("end", () => {
      const line = buffer.trim();
      if (line) {
        onLine(line);
      }
      resolve();
    });
    stream.on("error", () => resolve());
  });
}

function runUpscaylBatch(
  cli: string,
  inputDir: string,
  outputDir: string,
  scale: string,
  modelName: string,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cli, [
      "-i", inputDir,
      "-o", outputDir,
      "-s", scale,
      "-m", "..\\models",
      "-n", modelName,
      "-f", "png",
    ], {
      cwd: path.dirname(cli),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const stdoutDone = streamProcessOutput(child.stdout, appendUpscalerLog);
    const stderrDone = streamProcessOutput(child.stderr, appendUpscalerLog);

    let settled = false;
    const timeoutHandle = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill("SIGTERM");
      appendLog(`Upscayl batch timed out after 3600 seconds.`);
      Promise.all([stdoutDone, stderrDone]).finally(() => resolve(-1));
    }, 60 * 60 * 1000);

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      appendUpscalerLog(`Upscayl spawn error: ${error.message}`);
      Promise.all([stdoutDone, stderrDone]).finally(() => resolve(-1));
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutHandle);
      Promise.all([stdoutDone, stderrDone]).finally(() => resolve(code ?? -1));
    });
  });
}

function windowsRelative(filePath: string): string {
  return path.relative(ROOT, filePath).replaceAll("/", "\\");
}

function normalizedAbsolute(filePath: string): string {
  return path.resolve(filePath).replaceAll("/", "\\").toLowerCase();
}

function slugify(value: string): string {
  const cleaned = value
    .replace(/\.[^.]+$/, "")
    .replace(/^(img|dsc|dcim|photo|image)[-_ ]*/i, "")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  if (cleaned.length >= 3) {
    return cleaned.slice(0, 40);
  }
  return "image";
}

function todayStamp(): string {
  return compactDateStamp();
}

function assignedScale(longSide: number): number | "copy_only" | "low_res" {
  if (longSide >= 3840) return "copy_only";
  if (longSide >= 1921) return 2;
  if (longSide >= 1281) return 3;
  if (longSide >= 640) return 4;
  return "low_res";
}

function listImagesRecursive(startDir: string): string[] {
  const results: string[] = [];
  const queue = [startDir];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) {
          queue.push(fullPath);
        }
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function readDimensions(filePath: string): { width: number; height: number } | null {
  const command = `
    Add-Type -AssemblyName System.Drawing;
    $img = [System.Drawing.Image]::FromFile('${filePath.replace(/'/g, "''")}');
    try { Write-Output "$($img.Width)x$($img.Height)" } finally { $img.Dispose() }
  `;
  try {
    const output = execFileSync("powershell", ["-NoProfile", "-Command", command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    const match = output.match(/^(\d+)x(\d+)$/);
    if (!match) return null;
    return {
      width: Number.parseInt(match[1], 10),
      height: Number.parseInt(match[2], 10),
    };
  } catch {
    return null;
  }
}

function buildManualName(filePath: string, nextSeq: number): string {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath);
  return `manual_${slugify(base)}_M${String(nextSeq).padStart(3, "0")}_${todayStamp()}${ext}`;
}

function ensureFolder(filePath: string): void {
  fs.mkdirSync(filePath, { recursive: true });
}

function normalizeModelName(modelName: string | null | undefined): string {
  const normalized = (modelName ?? "").trim().toLowerCase();
  if (!normalized || normalized === "ultrasharp") {
    return "ultrasharp-4x";
  }
  return modelName ?? "ultrasharp-4x";
}

function chunkEntries<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function createSidecar(sidecarPath: string, imageFile: string, source: "ai_generated" | "manual", entry: Partial<RegistryEntry>): void {
  const dims = entry.dimensions ?? null;
  const sidecar = {
    image_file: imageFile,
    generated_at: entry.registered_at ?? jsonTimestamp(),
    source,
    series_slot: entry.series_slot ?? null,
    aspect_ratio: dims ? `${dims.width}:${dims.height}` : "unknown",
    trend_topic: entry.trend_topic ?? null,
    trend_category: null,
    loop_index: null,
    adobe_stock_metadata: {
      title: "",
      title_char_count: 0,
      keywords: [],
      keyword_count: 0,
      category: "",
      file_type: "Photos",
      created_with_ai: source === "ai_generated",
      people_are_fictional: source === "ai_generated",
      property_is_fictional: source === "ai_generated",
      editorial_use_only: false,
    },
    generation_context: {
      prompt_used: null,
      model_used: source === "ai_generated" ? "Nano Banana 2 / Flow" : null,
      commercial_use_cases: [],
      visual_keywords_from_trend: [],
    },
    metadata_generation_mode: source === "manual" ? "auto_from_visual_analysis_in_file_03" : "prompt_context_rebuild_required",
    status: source === "manual" ? "analysis_required_before_upscale" : "metadata_rebuild_required",
    applied_to_adobe_stock: false,
  };
  writeJson(sidecarPath, sidecar);
}

function readSidecarStatus(sidecarPath: string): string | null {
  try {
    const sidecar = JSON.parse(fs.readFileSync(sidecarPath, "utf8")) as { status?: unknown };
    return typeof sidecar.status === "string" ? sidecar.status : null;
  } catch {
    return null;
  }
}

function readActiveSessionTargets(): Set<string> {
  const sessionState = readJson<SessionState>(SESSION_STATE_PATH, {});
  const targets = new Set<string>();
  for (const item of sessionState.downloaded_images ?? []) {
    if (typeof item.saved_path !== "string" || !item.saved_path.trim()) {
      continue;
    }
    targets.add(normalizedAbsolute(item.saved_path));
  }
  return targets;
}

function classifySource(filePath: string): "ai_generated" | "manual" {
  const rel = windowsRelative(filePath);
  if (rel.startsWith("downloads\\manual\\")) {
    return "manual";
  }
  const parts = rel.split("\\");
  if (parts.length >= 3 && parts[0] === "downloads" && DATE_FOLDER_RE.test(parts[1])) {
    return "ai_generated";
  }
  return "manual";
}

function manualSequenceStart(existingRegistry: RegistryFile): number {
  return Object.values(existingRegistry.images).filter((entry) => entry.source === "manual").length + 1;
}

function ensureStagingPlaceholders(): void {
  ensureFolder(STAGING_DIR);
  const rootKeep = path.join(STAGING_DIR, ".gitkeep");
  if (!fs.existsSync(rootKeep)) {
    fs.writeFileSync(rootKeep, "", "utf8");
  }
  for (const bucket of ["x2", "x3", "x4", "copy_only"]) {
    const dir = path.join(STAGING_DIR, bucket);
    ensureFolder(dir);
    const keep = path.join(dir, ".gitkeep");
    if (!fs.existsSync(keep)) {
      fs.writeFileSync(keep, "", "utf8");
    }
  }
}

function clearStaging(): void {
  ensureStagingPlaceholders();
  for (const bucket of ["x2", "x3", "x4", "copy_only"]) {
    const dir = path.join(STAGING_DIR, bucket);
    ensureFolder(dir);
    for (const entry of fs.readdirSync(dir)) {
      if (entry === ".gitkeep") {
        continue;
      }
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
  }
}

function sourceDateFolder(entry: RegistryEntry): string {
  const rel = entry.source_path.replaceAll("/", "\\");
  const parts = rel.split("\\");
  if (parts.length >= 3 && parts[0] === "downloads" && DATE_FOLDER_RE.test(parts[1])) {
    return parts[1];
  }
  if (entry.registered_at && /^\d{4}-\d{2}-\d{2}__/.test(entry.registered_at)) {
    return entry.registered_at.slice(0, 10);
  }
  return dateFolderName();
}

function outputDirForEntry(entry: RegistryEntry): string {
  return path.join(DOWNLOADS_DIR, "upscaled", sourceDateFolder(entry));
}

function copyWithSidecar(sourceImage: string, sourceSidecar: string | null, destDir: string, outputName?: string): { imagePath: string; sidecarPath: string | null } {
  ensureFolder(destDir);
  const destImage = path.join(destDir, outputName ?? path.basename(sourceImage));
  fs.copyFileSync(sourceImage, destImage);
  let destSidecar: string | null = null;
  if (sourceSidecar && fs.existsSync(sourceSidecar)) {
    destSidecar = sidecarPathForImage(destImage);
    fs.copyFileSync(sourceSidecar, destSidecar);
  }
  return { imagePath: destImage, sidecarPath: destSidecar };
}

function quarantineImage(
  sourceImage: string,
  sourceSidecar: string | null,
  reasonCode: string,
  reasonDetail?: string | null,
): void {
  const result = quarantineFailedAsset({
    assetKey: path.parse(path.basename(sourceImage)).name,
    reasonCode,
    reasonDetail,
    relatedPaths: [sourceImage, sourceSidecar],
    extra: {
      source_stage: "03_IMAGE_UPSCALER",
    },
  });

  appendLog(
    `Moved failed asset to ${windowsRelative(result.folderPath)} | reason_code=${reasonCode}${reasonDetail ? ` | reason_detail=${reasonDetail}` : ""}`,
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  ensureFolder(LOGS_DIR);
  ensureStagingPlaceholders();

  const existingRegistry = readJson<RegistryFile>(IMAGE_REGISTRY_PATH, {
    last_updated: jsonTimestamp(),
    total_images: 0,
    images: {},
  });
  const upscalerState = readJson<UpscalerState>(UPSCALER_STATE_PATH, {});
  const registry: RegistryFile = {
    last_updated: jsonTimestamp(),
    total_images: 0,
    images: {},
  };

  let manualSeq = manualSequenceStart(existingRegistry);
  const allImages = listImagesRecursive(DOWNLOADS_DIR);
  let sidecarsCreated = 0;

  for (let imagePath of allImages) {
    let source = classifySource(imagePath);

    if (source === "manual") {
      ensureFolder(MANUAL_DIR);
      if (!windowsRelative(imagePath).startsWith("downloads\\manual\\")) {
        const movedPath = path.join(MANUAL_DIR, path.basename(imagePath));
        fs.renameSync(imagePath, movedPath);
        appendLog(`Moved root/manual candidate into downloads\\manual: ${path.basename(imagePath)}`);
        imagePath = movedPath;
      }

      const currentName = path.basename(imagePath);
      if (!MANUAL_NAME_RE.test(currentName)) {
        const renamed = buildManualName(imagePath, manualSeq);
        manualSeq += 1;
        const renamedPath = path.join(path.dirname(imagePath), renamed);
        fs.renameSync(imagePath, renamedPath);
        appendLog(`Renamed manual image: ${currentName} -> ${renamed}`);
        imagePath = renamedPath;
      }
    }

    const finalName = path.basename(imagePath);
    const existing = existingRegistry.images[finalName];
    const dims = readDimensions(imagePath);
    const longSide = dims ? Math.max(dims.width, dims.height) : null;
    const scale = longSide ? assignedScale(longSide) : "low_res";
    const sidecarPath = sidecarPathForImage(imagePath);
    if (!fs.existsSync(sidecarPath)) {
      createSidecar(sidecarPath, finalName, source, {
        ...existing,
        dimensions: dims,
        registered_at: existing?.registered_at ?? jsonTimestamp(),
      });
      sidecarsCreated += 1;
      appendLog(`Created missing sidecar for ${finalName}.`);
    }

    registry.images[finalName] = {
      source,
      final_name: finalName,
      original_name: existing?.original_name ?? finalName,
      source_path: windowsRelative(imagePath),
      dimensions: dims,
      long_side: longSide,
      assigned_scale: scale,
      metadata_sidecar: windowsRelative(sidecarPath),
      upscaled: existing?.upscaled ?? false,
      upscaled_path: existing?.upscaled_path ?? null,
      upscaled_dimensions: existing?.upscaled_dimensions ?? null,
      registered_at: existing?.registered_at ?? jsonTimestamp(),
      upscaled_at: existing?.upscaled_at ?? null,
      adobe_stock_status: existing?.adobe_stock_status ?? "not_uploaded",
      xmp_embed_status: existing?.xmp_embed_status ?? null,
      xmp_embedded_at: existing?.xmp_embedded_at ?? null,
      xmp_embed_detail: existing?.xmp_embed_detail ?? null,
      quality_flag: scale === "low_res" ? "review_before_upload" : existing?.quality_flag,
      trend_topic: existing?.trend_topic ?? null,
      series_slot: existing?.series_slot ?? null,
      prompt_id: existing?.prompt_id ?? null,
      media_name: existing?.media_name ?? null,
    };
  }

  registry.total_images = Object.keys(registry.images).length;
  registry.last_updated = jsonTimestamp();
  writeJson(IMAGE_REGISTRY_PATH, registry);

  const imageCount = allImages.length;
  const sidecarCount = listImagesRecursive(DOWNLOADS_DIR)
    .map((filePath) => sidecarPathForImage(filePath))
    .filter((sidecarPath) => fs.existsSync(sidecarPath)).length;

  appendLog(`Sub-Agent E parity scan complete. Images=${imageCount}, sidecars=${sidecarCount}, created=${sidecarsCreated}, registry=${registry.total_images}.`);
  appendUpscalerLog(`Parity scan complete. Images=${imageCount}, sidecars=${sidecarCount}, created=${sidecarsCreated}, registry=${registry.total_images}.`);

  clearStaging();

  const requestedImage = args.mode === "fifo" && args.image
    ? normalizedAbsolute(args.image)
    : null;
  const activeSessionTargets = readActiveSessionTargets();
  const restrictBatchToSessionTargets = args.mode === "batch" && activeSessionTargets.size > 0;
  if (restrictBatchToSessionTargets) {
    appendLog(`Batch upscale restricted to active session targets (${activeSessionTargets.size} image(s)).`);
  }

  let fifoTargetNames: Set<string> | null = null;
  if (args.mode === "fifo") {
    const candidates = Object.values(registry.images)
      .filter((entry) => !entry.upscaled)
      .filter((entry) => entry.source === "ai_generated")
      .filter((entry) => {
        if (!requestedImage) return true;
        const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
        return normalizedAbsolute(sourceImage) === requestedImage;
      })
      .sort((left, right) => String(left.registered_at ?? "").localeCompare(String(right.registered_at ?? "")));

    if (!candidates.length) {
      appendLog(`FIFO prepare found no pending image${args.image ? ` for ${args.image}` : ""}.`);
      return;
    }

    fifoTargetNames = new Set([candidates[0].final_name]);
    appendLog(`FIFO prepare selected ${candidates[0].final_name}.`);
  }

  const bucketGroups = new Map<string, RegistryEntry[]>();

  function pushBucket(bucket: "x2" | "x3" | "x4" | "copy_only", entry: RegistryEntry): void {
    const outputDir = outputDirForEntry(entry);
    const key = `${bucket}|${outputDir}`;
    const current = bucketGroups.get(key) ?? [];
    current.push(entry);
    bucketGroups.set(key, current);
  }

  function finalizeOutput(entry: RegistryEntry, outputImage: string, outputSidecar: string | null): void {
    const xmpResult = embedXmpMetadata(outputImage, outputSidecar);
    entry.upscaled = true;
    entry.upscaled_path = windowsRelative(outputImage);
    entry.upscaled_dimensions = readDimensions(outputImage);
    entry.upscaled_at = jsonTimestamp();
    entry.adobe_stock_status = "ready_for_metadata_apply";
    entry.xmp_embed_status = xmpResult.status;
    entry.xmp_embedded_at = xmpResult.embeddedAt;
    entry.xmp_embed_detail = xmpResult.detail;

    if (xmpResult.status === "embedded") {
      appendLog(`XMP embedded for ${entry.final_name} before Adobe upload.`);
    } else {
      appendLog(`XMP embed ${xmpResult.status} for ${entry.final_name}: ${xmpResult.detail}`);
    }

    if (args.mode === "fifo") {
      appendLog(`FIFO prepare complete for ${entry.final_name}. Output=${entry.upscaled_path}.`);
    }
  }

  for (const entry of Object.values(registry.images)) {
    const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
    if (requestedImage && normalizedAbsolute(sourceImage) !== requestedImage) {
      continue;
    }
    if (restrictBatchToSessionTargets && !activeSessionTargets.has(normalizedAbsolute(sourceImage))) {
      continue;
    }
    if (entry.upscaled) {
      continue;
    }
    if (entry.adobe_stock_status === "failed_moved_to_downloads_failed") {
      continue;
    }
    if (entry.source === "manual") {
      const sourceSidecar = path.join(ROOT, entry.metadata_sidecar.replaceAll("\\", path.sep));
      const status = readSidecarStatus(sourceSidecar);
      if (status !== "ready_for_upload") {
        quarantineImage(
          sourceImage,
          sourceSidecar,
          "manual_metadata_incomplete",
          status ?? "missing",
        );
        entry.adobe_stock_status = "failed_moved_to_downloads_failed";
        entry.quality_flag = "failed_before_upscale";
        continue;
      }
    }
    if (fifoTargetNames && !fifoTargetNames.has(entry.final_name)) {
      continue;
    }
    if (!fs.existsSync(sourceImage)) {
      continue;
    }
    if (entry.assigned_scale === "copy_only") {
      pushBucket("copy_only", entry);
      continue;
    }
    const bucket = entry.assigned_scale === 2 ? "x2" : entry.assigned_scale === 3 ? "x3" : "x4";
    pushBucket(bucket as "x2" | "x3" | "x4", entry);
  }

  for (const [groupKey, entries] of bucketGroups.entries()) {
    const [bucket, outputDir] = groupKey.split("|", 2);
    if (bucket !== "copy_only") {
      continue;
    }
    ensureFolder(outputDir);
    for (const entry of entries) {
      const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
      const sourceSidecar = path.join(ROOT, entry.metadata_sidecar.replaceAll("\\", path.sep));
      const copied = copyWithSidecar(sourceImage, sourceSidecar, outputDir);
      finalizeOutput(entry, copied.imagePath, copied.sidecarPath);
    }
  }

  const cli = upscalerState.cli_binary_path;
  const modelName = normalizeModelName(upscalerState.model_name);
  const upscaleBatchSize = 16;
  if (upscalerState.method !== "cli" || !cli || !fs.existsSync(cli)) {
    appendLog("02 pipeline stopped before upscaling because the Upscayl CLI path is unavailable.");
    writeJson(IMAGE_REGISTRY_PATH, registry);
    return;
  }

  for (const [groupKey, originalEntries] of Array.from(bucketGroups.entries())) {
    const [bucket, outputDir] = groupKey.split("|", 2);
    if (bucket === "copy_only" || !originalEntries.length) {
      continue;
    }

    const pendingEntries: RegistryEntry[] = [];
    for (const entry of originalEntries) {
      const existingOutputImage = path.join(outputDir, `${path.parse(entry.final_name).name}.png`);
      if (!fs.existsSync(existingOutputImage)) {
        pendingEntries.push(entry);
        continue;
      }

      const sourceSidecar = path.join(ROOT, entry.metadata_sidecar.replaceAll("\\", path.sep));
      let existingOutputSidecar: string | null = null;
      if (fs.existsSync(sourceSidecar)) {
        existingOutputSidecar = sidecarPathForImage(existingOutputImage);
        fs.mkdirSync(path.dirname(existingOutputSidecar), { recursive: true });
        if (!fs.existsSync(existingOutputSidecar)) {
          fs.copyFileSync(sourceSidecar, existingOutputSidecar);
        }
      }

      finalizeOutput(entry, existingOutputImage, existingOutputSidecar);
      appendLog(`Reconciled existing upscaled output for ${entry.final_name}; skipping re-upscale.`);
    }

    bucketGroups.set(groupKey, pendingEntries);
  }

  for (const [groupKey, entries] of bucketGroups.entries()) {
    const [bucket, outputDir] = groupKey.split("|", 2);
    if (bucket === "copy_only" || !entries.length) {
      continue;
    }
    const scale = bucket === "x2" ? "2" : bucket === "x3" ? "3" : "4";
    ensureFolder(outputDir);
    const inputDir = path.join(STAGING_DIR, bucket);
    const entryChunks = chunkEntries(entries, upscaleBatchSize);
    for (const [chunkIndex, entryChunk] of entryChunks.entries()) {
      for (const stagedName of fs.readdirSync(inputDir)) {
        if (stagedName === ".gitkeep") {
          continue;
        }
        fs.rmSync(path.join(inputDir, stagedName), { recursive: true, force: true });
      }

      for (const entry of entryChunk) {
        const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
        fs.copyFileSync(sourceImage, path.join(inputDir, path.basename(sourceImage)));
      }

      appendUpscalerLog(`Running CLI for ${bucket} batch ${chunkIndex + 1}/${entryChunks.length} with ${entryChunk.length} image(s) -> ${windowsRelative(outputDir)}.`);
      const exitCode = await runUpscaylBatch(cli, inputDir, outputDir, scale, modelName);

      if (exitCode !== 0) {
        appendLog(`Upscayl batch ${bucket} chunk ${chunkIndex + 1}/${entryChunks.length} exited with code ${exitCode}.`);
        appendUpscalerLog(`Upscayl batch ${bucket} chunk ${chunkIndex + 1}/${entryChunks.length} exited with code ${exitCode}.`);
        for (const entry of entryChunk) {
          const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
          const sourceSidecar = path.join(ROOT, entry.metadata_sidecar.replaceAll("\\", path.sep));
          quarantineImage(
            sourceImage,
            sourceSidecar,
            "upscale_cli_failed",
            `${bucket}:chunk_${chunkIndex + 1}:exit_${exitCode}`,
          );
          entry.adobe_stock_status = "failed_moved_to_downloads_failed";
          entry.quality_flag = "upscale_failed";
        }
        continue;
      }

      for (const entry of entryChunk) {
        const sourceSidecar = path.join(ROOT, entry.metadata_sidecar.replaceAll("\\", path.sep));
        const outputImage = path.join(outputDir, `${path.parse(entry.final_name).name}.png`);
        if (!fs.existsSync(outputImage)) {
          appendLog(`Upscaled output missing for ${entry.final_name} in batch ${bucket} chunk ${chunkIndex + 1}/${entryChunks.length}.`);
          const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
          quarantineImage(sourceImage, sourceSidecar, "upscale_output_missing", `${bucket}:chunk_${chunkIndex + 1}`);
          entry.adobe_stock_status = "failed_moved_to_downloads_failed";
          entry.quality_flag = "upscale_failed";
          continue;
        }
        let outputSidecar: string | null = null;
        if (fs.existsSync(sourceSidecar)) {
          outputSidecar = sidecarPathForImage(outputImage);
          fs.mkdirSync(path.dirname(outputSidecar), { recursive: true });
          fs.copyFileSync(sourceSidecar, outputSidecar);
        }
        finalizeOutput(entry, outputImage, outputSidecar);
      }
    }
  }

  registry.last_updated = jsonTimestamp();
  registry.total_images = Object.keys(registry.images).length;
  writeJson(IMAGE_REGISTRY_PATH, registry);
  clearStaging();
  if (args.mode === "fifo") {
    appendLog(`FIFO prepare run complete. Registry=${registry.total_images}.`);
    appendUpscalerLog(`FIFO prepare run complete.`);
  } else {
    appendLog(`02 pipeline complete. Registry=${registry.total_images}.`);
    appendUpscalerLog(`02 pipeline complete.`);
  }
}

void main();
