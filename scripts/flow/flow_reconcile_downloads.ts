import fs from "node:fs";
import path from "node:path";
import { appendAutomationLog } from "../common/logging";
import { listSidecarFiles, resolveExistingSidecarPath } from "../common/sidecars";
import { DESCRIPTIONS_PATH, DOWNLOADS_DIR, SESSION_STATE_PATH } from "../project_paths";
import { dateFolderName } from "../common/time";

type DownloadedImage = {
  media_name?: string;
  prompt_id?: number | null;
  saved_path?: string;
  suggested_filename?: string;
  downloaded_at?: string | null;
  download_mode?: string | null;
};

type Description = {
  id: number;
  trend_id?: number;
  aspect_ratio?: string;
  series_slot?: string;
  status?: string;
  submitted_at?: string | null;
};

type BatchRecord = {
  prompt_ids?: number[];
  rendered_media?: Array<{
    prompt_id?: number | null;
    media_name?: string;
  }>;
};

type SessionState = {
  session_image_cap?: number;
  session_aspect_cap?: number;
  downloaded_images?: DownloadedImage[];
  images_downloaded_count?: number;
  images_created_count?: number;
  images_created_16x9_count?: number;
  images_created_1x1_count?: number;
  remaining_session_image_capacity?: number;
  remaining_16x9_capacity?: number;
  remaining_1x1_capacity?: number;
  current_description_index?: number | null;
  current_trend_id?: number | null;
  current_series_slot?: string | null;
  current_16x9_submitted?: number[];
  current_1x1_submitted?: number[];
  current_16x9_rendered?: string[];
  current_1x1_rendered?: string[];
  active_batches?: BatchRecord[];
  last_render_batch?: BatchRecord;
};

type DescriptionsFile = {
  descriptions?: Description[];
};

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

function inferSeriesSlotFromFilename(filePath: string): string | null {
  const stem = path.parse(filePath).name.toLowerCase();
  if (stem.includes("wide_establishing")) return "16A_establishing";
  if (stem.includes("horizontal_close-up_detail") || stem.includes("horizontal_close_up_detail")) return "16B_detail";
  if (stem.includes("overhead_or_scale")) return "16C_scale";
  if (stem.includes("alternate_wide_demographic") || stem.includes("alternate_wide_mood")) return "16D_alt";
  if (stem.includes("centered_square_hero") || stem.includes("centered_square_portrait") || stem.includes("centered_square_collaboration")) return "1A_iconic";
  if (stem.includes("extreme_square_close-up") || stem.includes("extreme_square_close_up")) return "1B_variation";
  if (
    stem.includes("top-down_square")
    || stem.includes("top_down_square")
    || stem.includes("flat-lay_square")
    || stem.includes("flat_lay_square")
    || stem.includes("top-down_or_flat-lay")
    || stem.includes("top_down_or_flat_lay")
    || stem.includes("top-down_or_flat_lay")
    || stem.includes("top_down_or_flat-lay")
  ) return "1C_closeup";
  if (stem.includes("square_alternate_demographic") || stem.includes("square_alternate")) return "1D_isolated";
  return null;
}

function normalizeBrowserSpillStem(fileName: string): string {
  return path.parse(fileName).name.replace(/\s+\(\d+\)$/, "");
}

function normalizeProjectImageStem(fileName: string): string {
  return path.parse(fileName).name.replace(/__[12]K__.*$/i, "");
}

function normalizePromptFamilyStem(fileName: string): string {
  return normalizeProjectImageStem(normalizeBrowserSpillStem(fileName)).replace(/_\d{12}$/i, "");
}

function safeMoveWithSidecar(imagePath: string, destinationDir: string): void {
  fs.mkdirSync(destinationDir, { recursive: true });
  const destinationImage = path.join(destinationDir, path.basename(imagePath));
  if (fs.existsSync(imagePath)) {
    fs.renameSync(imagePath, destinationImage);
  }
  const sidecarPath = resolveExistingSidecarPath(imagePath);
  if (sidecarPath) {
    fs.renameSync(sidecarPath, path.join(destinationDir, path.basename(sidecarPath)));
  }
}

function fileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return 0;
  }
}

function modeRank(item: DownloadedImage): number {
  const mode = String(item.download_mode ?? "");
  if (mode === "2K") return 2;
  if (mode === "1X") return 1;
  return 0;
}

function compareEntries(left: DownloadedImage, right: DownloadedImage, expectedSeriesSlot: string | null): number {
  const leftMatches = inferSeriesSlotFromFilename(String(left.saved_path ?? "")) === expectedSeriesSlot ? 1 : 0;
  const rightMatches = inferSeriesSlotFromFilename(String(right.saved_path ?? "")) === expectedSeriesSlot ? 1 : 0;
  if (leftMatches !== rightMatches) {
    return rightMatches - leftMatches;
  }

  const leftMode = modeRank(left);
  const rightMode = modeRank(right);
  if (leftMode !== rightMode) {
    return rightMode - leftMode;
  }

  const leftSize = fileSize(String(left.saved_path ?? ""));
  const rightSize = fileSize(String(right.saved_path ?? ""));
  if (leftSize !== rightSize) {
    return rightSize - leftSize;
  }

  return String(right.downloaded_at ?? "").localeCompare(String(left.downloaded_at ?? ""));
}

function filterPromptIds(promptIds: number[] | undefined, resetPromptIds: Set<number>): number[] {
  return (promptIds ?? []).filter((promptId) => !resetPromptIds.has(promptId));
}

function filterRenderedMedia(
  renderedMedia: BatchRecord["rendered_media"] | undefined,
  canonicalMediaNames: Set<string>,
  resetPromptIds: Set<number>,
): BatchRecord["rendered_media"] {
  return (renderedMedia ?? []).filter((item) => {
    if (typeof item.prompt_id === "number" && resetPromptIds.has(item.prompt_id)) {
      return false;
    }
    return item.media_name ? canonicalMediaNames.has(item.media_name) : false;
  });
}

function main(): void {
  const session = readJson<SessionState>(SESSION_STATE_PATH, {});
  const descriptionsFile = readJson<DescriptionsFile>(DESCRIPTIONS_PATH, { descriptions: [] });
  const descriptions = descriptionsFile.descriptions ?? [];
  const descriptionsById = new Map(descriptions.map((item) => [item.id, item]));
  const dateToken = (() => {
    const firstSavedPath = (session.downloaded_images ?? [])
      .map((item) => String(item.saved_path ?? ""))
      .find(Boolean);
    if (!firstSavedPath) {
      return dateFolderName();
    }
    const parts = firstSavedPath.split(path.sep);
    return parts[parts.length - 2] || dateFolderName();
  })();

  const dayDir = path.join(DOWNLOADS_DIR, dateToken);
  const quarantineRoot = path.join(DOWNLOADS_DIR, "failed", dateToken, "hermes_drift_cleanup");
  const duplicatePromptDir = path.join(quarantineRoot, "duplicate_prompt");
  const untrackedDir = path.join(quarantineRoot, "untracked_image");
  const browserSpillDir = path.join(quarantineRoot, "browser_spillover");

  const existingDownloadedEntries = (session.downloaded_images ?? [])
    .filter((item) => typeof item.prompt_id === "number")
    .filter((item) => fs.existsSync(String(item.saved_path ?? "")));

  const entriesByPrompt = new Map<number, DownloadedImage[]>();
  for (const entry of existingDownloadedEntries) {
    const promptId = entry.prompt_id as number;
    const bucket = entriesByPrompt.get(promptId) ?? [];
    bucket.push(entry);
    entriesByPrompt.set(promptId, bucket);
  }

  const canonicalEntries: DownloadedImage[] = [];
  for (const [promptId, entries] of [...entriesByPrompt.entries()].sort((a, b) => a[0] - b[0])) {
    const expectedSeriesSlot = descriptionsById.get(promptId)?.series_slot ?? null;
    const sorted = [...entries].sort((left, right) => compareEntries(left, right, expectedSeriesSlot));
    const keep = sorted[0];
    canonicalEntries.push(keep);
    for (const duplicate of sorted.slice(1)) {
      safeMoveWithSidecar(String(duplicate.saved_path ?? ""), duplicatePromptDir);
    }
  }

  const canonicalPaths = new Set(canonicalEntries.map((item) => String(item.saved_path ?? "")));
  const canonicalMediaNames = new Set(canonicalEntries.map((item) => String(item.media_name ?? "")));
  const canonicalPromptIds = new Set(canonicalEntries.map((item) => item.prompt_id as number));

  if (fs.existsSync(dayDir)) {
    for (const entry of fs.readdirSync(dayDir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }
      const filePath = path.join(dayDir, entry.name);
      const isImage = /\.(png|jpe?g|webp)$/i.test(entry.name);
      if (!isImage) {
        continue;
      }

      if (isImage && !canonicalPaths.has(filePath)) {
        safeMoveWithSidecar(filePath, untrackedDir);
      }
    }
  }

  for (const sidecarPath of listSidecarFiles(dayDir)) {
    const sidecarStem = path.basename(sidecarPath).replace(/\.metadata\.json$/i, "");
    const hasCanonicalImage = [...canonicalPaths].some((candidatePath) => path.parse(candidatePath).dir === dayDir && path.parse(candidatePath).name === sidecarStem);
    if (!hasCanonicalImage) {
      fs.mkdirSync(untrackedDir, { recursive: true });
      fs.renameSync(sidecarPath, path.join(untrackedDir, path.basename(sidecarPath)));
    }
  }

  const browserDownloadsDir = path.join(process.env.USERPROFILE ?? path.dirname(DOWNLOADS_DIR), "Downloads");
  const knownBrowserSpillStems = new Set<string>();
  for (const scanDir of [dayDir, duplicatePromptDir, untrackedDir]) {
    if (!fs.existsSync(scanDir)) {
      continue;
    }
    for (const entry of fs.readdirSync(scanDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(png|jpe?g|webp)$/i.test(entry.name)) {
        continue;
      }
      knownBrowserSpillStems.add(normalizePromptFamilyStem(entry.name));
    }
  }
  if (fs.existsSync(browserDownloadsDir)) {
    for (const entry of fs.readdirSync(browserDownloadsDir, { withFileTypes: true })) {
      if (!entry.isFile()) {
        continue;
      }
      if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) {
        continue;
      }
      const stem = normalizePromptFamilyStem(entry.name);
      if (!knownBrowserSpillStems.has(stem)) {
        continue;
      }
      const candidatePath = path.join(browserDownloadsDir, entry.name);
      const stats = fs.statSync(candidatePath);
      if (stats.mtimeMs < new Date(`${dateToken}T00:00:00`).getTime()) {
        continue;
      }
      fs.mkdirSync(browserSpillDir, { recursive: true });
      fs.renameSync(candidatePath, path.join(browserSpillDir, entry.name));
    }
  }

  const resetPromptIds = new Set(
    descriptions
      .filter((item) => item.status === "submitted")
      .filter((item) => !canonicalPromptIds.has(item.id))
      .map((item) => item.id),
  );

  for (const description of descriptions) {
    if (!resetPromptIds.has(description.id)) {
      continue;
    }
    description.status = "ready";
    description.submitted_at = null;
  }

  const readyDescriptions = descriptions
    .filter((item) => item.status === "ready")
    .sort((left, right) => left.id - right.id);
  const inFlightDescriptions = descriptions.filter((item) => item.status !== "ready");
  const sessionImageCap = session.session_image_cap ?? 64;
  const sessionAspectCap = session.session_aspect_cap ?? 32;
  const created16x9 = inFlightDescriptions.filter((item) => item.aspect_ratio === "16:9").length;
  const created1x1 = inFlightDescriptions.filter((item) => item.aspect_ratio === "1:1").length;

  session.downloaded_images = canonicalEntries;
  session.images_downloaded_count = canonicalEntries.length;
  session.images_created_count = inFlightDescriptions.length;
  session.images_created_16x9_count = created16x9;
  session.images_created_1x1_count = created1x1;
  session.remaining_session_image_capacity = Math.max(0, sessionImageCap - inFlightDescriptions.length);
  session.remaining_16x9_capacity = Math.max(0, sessionAspectCap - created16x9);
  session.remaining_1x1_capacity = Math.max(0, sessionAspectCap - created1x1);
  session.current_description_index = readyDescriptions[0]?.id ?? null;
  session.current_trend_id = readyDescriptions[0]?.trend_id ?? null;
  session.current_series_slot = readyDescriptions[0]?.series_slot ?? null;
  session.current_16x9_submitted = filterPromptIds(session.current_16x9_submitted, resetPromptIds);
  session.current_1x1_submitted = filterPromptIds(session.current_1x1_submitted, resetPromptIds);
  session.current_16x9_rendered = (session.current_16x9_rendered ?? []).filter((mediaName) => canonicalMediaNames.has(mediaName));
  session.current_1x1_rendered = (session.current_1x1_rendered ?? []).filter((mediaName) => canonicalMediaNames.has(mediaName));
  session.active_batches = (session.active_batches ?? [])
    .map((batch) => ({
      ...batch,
      prompt_ids: filterPromptIds(batch.prompt_ids, resetPromptIds),
      rendered_media: filterRenderedMedia(batch.rendered_media, canonicalMediaNames, resetPromptIds),
    }))
    .filter((batch) => (batch.prompt_ids ?? []).length > 0);

  if (session.last_render_batch) {
    session.last_render_batch = {
      ...session.last_render_batch,
      prompt_ids: filterPromptIds(session.last_render_batch.prompt_ids, resetPromptIds),
      rendered_media: filterRenderedMedia(session.last_render_batch.rendered_media, canonicalMediaNames, resetPromptIds),
    };
    if (!(session.last_render_batch.prompt_ids ?? []).length) {
      session.last_render_batch = undefined;
    }
  }

  descriptionsFile.descriptions = descriptions;
  writeJson(DESCRIPTIONS_PATH, descriptionsFile);
  writeJson(SESSION_STATE_PATH, session);
  appendLog(
    `Flow reconcile-downloads complete. kept=${canonicalEntries.length}, reset_prompts=${resetPromptIds.size}, quarantined_duplicates=${existingDownloadedEntries.length - canonicalEntries.length}.`,
  );
}

main();
