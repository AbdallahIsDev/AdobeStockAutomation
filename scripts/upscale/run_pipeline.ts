import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { quarantineFailedAsset } from "../common/failed_assets";
import { compactDateStamp, dateFolderName, jsonTimestamp } from "../common/time";
import {
  AUTOMATION_LOG_PATH,
  DATA_DIR,
  DOWNLOADS_DIR,
  IMAGE_REGISTRY_PATH,
  LOGS_DIR,
  ROOT,
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

type RunMode = "batch" | "fifo";

type CliArgs = {
  mode: RunMode;
  image: string | null;
};

const UPSCALER_LOG_PATH = AUTOMATION_LOG_PATH;
const OUTPUT_DIR = path.join(DOWNLOADS_DIR, "upscaled", dateFolderName());
const MANUAL_DIR = path.join(DOWNLOADS_DIR, "manual");

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"]);
const EXCLUDED_DIRS = new Set(["upscaled", "staging"]);
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
  fs.mkdirSync(path.dirname(AUTOMATION_LOG_PATH), { recursive: true });
  fs.appendFileSync(AUTOMATION_LOG_PATH, `${jsonTimestamp()} ${message}\n`, "utf8");
}

function appendUpscalerLog(message: string): void {
  fs.mkdirSync(path.dirname(UPSCALER_LOG_PATH), { recursive: true });
  fs.appendFileSync(UPSCALER_LOG_PATH, `${jsonTimestamp()} ${message}\n`, "utf8");
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
    metadata_generation_mode: source === "manual" ? "auto_from_visual_analysis_in_file_03" : "verify_existing_metadata",
    status: source === "manual" ? "analysis_required_before_upscale" : "stub_created_pending_review",
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

function clearStaging(): void {
  for (const bucket of ["x2", "x3", "x4", "copy_only"]) {
    const dir = path.join(STAGING_DIR, bucket);
    ensureFolder(dir);
    for (const entry of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
  }
}

function copyWithSidecar(sourceImage: string, sourceSidecar: string | null, destDir: string, outputName?: string): { imagePath: string; sidecarPath: string | null } {
  ensureFolder(destDir);
  const destImage = path.join(destDir, outputName ?? path.basename(sourceImage));
  fs.copyFileSync(sourceImage, destImage);
  let destSidecar: string | null = null;
  if (sourceSidecar && fs.existsSync(sourceSidecar)) {
    destSidecar = path.join(destDir, `${path.parse(destImage).name}.metadata.json`);
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

function main(): void {
  const args = parseArgs();
  ensureFolder(LOGS_DIR);
  ensureFolder(OUTPUT_DIR);

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
    const sidecarPath = path.join(path.dirname(imagePath), `${path.parse(finalName).name}.metadata.json`);
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
    .map((filePath) => path.join(path.dirname(filePath), `${path.parse(filePath).name}.metadata.json`))
    .filter((sidecarPath) => fs.existsSync(sidecarPath)).length;

  appendLog(`Sub-Agent E parity scan complete. Images=${imageCount}, sidecars=${sidecarCount}, created=${sidecarsCreated}, registry=${registry.total_images}.`);
  appendUpscalerLog(`Parity scan complete. Images=${imageCount}, sidecars=${sidecarCount}, created=${sidecarsCreated}, registry=${registry.total_images}.`);

  clearStaging();

  const requestedImage = args.mode === "fifo" && args.image
    ? normalizedAbsolute(args.image)
    : null;

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

  const buckets: Record<string, string[]> = {
    x2: [],
    x3: [],
    x4: [],
    copy_only: [],
  };

  for (const entry of Object.values(registry.images)) {
    const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
    if (requestedImage && normalizedAbsolute(sourceImage) !== requestedImage) {
      continue;
    }
    if (entry.upscaled) {
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
      buckets.copy_only.push(entry.final_name);
      continue;
    }
    const bucket = entry.assigned_scale === 2 ? "x2" : entry.assigned_scale === 3 ? "x3" : "x4";
    buckets[bucket].push(entry.final_name);
  }

  for (const finalName of buckets.copy_only) {
    const entry = registry.images[finalName];
    const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
    const sourceSidecar = path.join(ROOT, entry.metadata_sidecar.replaceAll("\\", path.sep));
    const copied = copyWithSidecar(sourceImage, sourceSidecar, OUTPUT_DIR);
    const dims = readDimensions(copied.imagePath);
    entry.upscaled = true;
    entry.upscaled_path = windowsRelative(copied.imagePath);
    entry.upscaled_dimensions = dims;
    entry.upscaled_at = jsonTimestamp();
    entry.adobe_stock_status = "ready_for_metadata_apply";
    if (args.mode === "fifo") {
      appendLog(`FIFO prepare complete for ${finalName}. Output=${entry.upscaled_path}.`);
    }
  }

  const cli = upscalerState.cli_binary_path;
  const modelName = normalizeModelName(upscalerState.model_name);
  if (upscalerState.method !== "cli" || !cli || !fs.existsSync(cli)) {
    appendLog("02 pipeline stopped before upscaling because the Upscayl CLI path is unavailable.");
    writeJson(IMAGE_REGISTRY_PATH, registry);
    return;
  }

  for (const [bucket, finalNames] of Object.entries(buckets)) {
    if (bucket === "copy_only" || !finalNames.length) {
      continue;
    }
    const scale = bucket === "x2" ? "2" : bucket === "x3" ? "3" : "4";
    const inputDir = path.join(STAGING_DIR, bucket);
    for (const finalName of finalNames) {
      const entry = registry.images[finalName];
      const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
      fs.copyFileSync(sourceImage, path.join(inputDir, path.basename(sourceImage)));
    }

    appendUpscalerLog(`Running CLI for ${bucket} with ${finalNames.length} image(s).`);
    const result = spawnSync(cli, [
      "-i", inputDir,
      "-o", OUTPUT_DIR,
      "-s", scale,
      "-m", "..\\models",
      "-n", modelName,
      "-f", "png",
    ], {
      cwd: path.dirname(cli),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60 * 60 * 1000,
    });

    appendUpscalerLog(result.stdout ?? "");
    appendUpscalerLog(result.stderr ?? "");

    if (result.status !== 0) {
      appendLog(`Upscayl batch ${bucket} exited with code ${result.status ?? -1}.`);
      appendUpscalerLog(`Upscayl batch ${bucket} exited with code ${result.status ?? -1}.`);
      for (const finalName of finalNames) {
        const entry = registry.images[finalName];
        const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
        const sourceSidecar = path.join(ROOT, entry.metadata_sidecar.replaceAll("\\", path.sep));
        quarantineImage(
          sourceImage,
          sourceSidecar,
          "upscale_cli_failed",
          `${bucket}:exit_${result.status ?? -1}`,
        );
        entry.adobe_stock_status = "failed_moved_to_downloads_failed";
        entry.quality_flag = "upscale_failed";
      }
      continue;
    }

    for (const finalName of finalNames) {
      const entry = registry.images[finalName];
      const sourceSidecar = path.join(ROOT, entry.metadata_sidecar.replaceAll("\\", path.sep));
      const outputImage = path.join(OUTPUT_DIR, `${path.parse(finalName).name}.png`);
      if (!fs.existsSync(outputImage)) {
        appendLog(`Upscaled output missing for ${finalName} in batch ${bucket}.`);
        const sourceImage = path.join(ROOT, entry.source_path.replaceAll("\\", path.sep));
        quarantineImage(sourceImage, sourceSidecar, "upscale_output_missing", bucket);
        entry.adobe_stock_status = "failed_moved_to_downloads_failed";
        entry.quality_flag = "upscale_failed";
        continue;
      }
      if (fs.existsSync(sourceSidecar)) {
        const outputSidecar = path.join(OUTPUT_DIR, `${path.parse(outputImage).name}.metadata.json`);
        fs.copyFileSync(sourceSidecar, outputSidecar);
      }
      entry.upscaled = true;
      entry.upscaled_path = windowsRelative(outputImage);
      entry.upscaled_dimensions = readDimensions(outputImage);
      entry.upscaled_at = jsonTimestamp();
      entry.adobe_stock_status = "ready_for_metadata_apply";
      if (args.mode === "fifo") {
        appendLog(`FIFO prepare complete for ${finalName}. Output=${entry.upscaled_path}.`);
      }
    }
  }

  registry.last_updated = jsonTimestamp();
  registry.total_images = Object.keys(registry.images).length;
  writeJson(IMAGE_REGISTRY_PATH, registry);
  if (args.mode === "fifo") {
    appendLog(`FIFO prepare run complete. Registry=${registry.total_images}, output=${windowsRelative(OUTPUT_DIR)}.`);
    appendUpscalerLog(`FIFO prepare run complete. Output=${windowsRelative(OUTPUT_DIR)}.`);
  } else {
    appendLog(`02 pipeline complete. Registry=${registry.total_images}, output=${windowsRelative(OUTPUT_DIR)}.`);
    appendUpscalerLog(`02 pipeline complete. Output=${windowsRelative(OUTPUT_DIR)}.`);
  }
}

main();
