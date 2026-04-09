import fs from "node:fs";
import path from "node:path";
import type { Download, Page } from "playwright";
import { connectBrowser, getOrOpenPage, isDebugPortReady } from "@bac/browser_core";
import { AUTOMATION_LOG_PATH, DATA_DIR, DESCRIPTIONS_PATH, DOWNLOADS_DIR, SESSION_STATE_PATH } from "../project_paths";
import { buildAiMetadataContext } from "../common/ai_metadata";
import { resolvePromptIdForDownload } from "../common/prompt_resolution";
import { resolveExistingSidecarPath, sidecarPathForImage } from "../common/sidecars";
import { dateFolderName, jsonTimestamp } from "../common/time";
import { appendAutomationLog } from "../common/logging";

type JsonRecord = Record<string, unknown>;

type DownloadedImage = {
  media_name: string;
  prompt_id?: number | null;
  saved_path: string;
  suggested_filename?: string;
  download_attempt?: number;
  downloaded_at?: string;
  download_mode?: string;
  note?: string;
  href?: string | null;
  tile_id?: string | null;
  project_id?: string | null;
};

type SessionState = {
  current_project_url?: string;
  current_project_id?: string;
  pipeline_mode?: string;
  post_download_policy?: string;
  current_step?: string;
  images_downloaded_count?: number;
  downloaded_images?: DownloadedImage[];
  run_baseline_media_names?: string[];
  errors?: string[];
  active_batches?: Array<{
    prompt_ids?: number[];
    aspect_ratio?: string;
    rendered_media?: Array<{
      prompt_id?: number | null;
      media_name?: string;
      href?: string | null;
      tile_id?: string | null;
    }>;
  }>;
  current_16x9_rendered?: string[];
  current_1x1_rendered?: string[];
  current_model?: string;
  last_render_batch?: {
    prompt_ids?: number[];
    aspect_ratio?: string;
    rendered_media?: Array<{
      prompt_id?: number | null;
      media_name?: string;
      href?: string | null;
      tile_id?: string | null;
    }>;
  };
};

type BrowserProbe = {
  cdp_port?: number;
  checked_at?: string;
  status?: string;
  page_url?: string;
  project_id?: string | null;
  evidence?: string[];
  downloads?: JsonRecord[];
};

type GeneratedImage = {
  index: number;
  mediaName: string;
  tileId: string | null;
  href: string | null;
  top: number;
  left: number;
};

type CurrentBatchTarget = {
  media_name: string;
  prompt_id?: number | null;
  href?: string | null;
  tile_id?: string | null;
};

type SavedDownload = {
  image: GeneratedImage;
  mode: "2K" | "1X";
  attempt: number;
  savedPath: string;
  suggestedFilename: string;
  toastText: string | null;
};

const ROOT = process.cwd();
const BROWSER_PROBE_PATH = path.join(DATA_DIR, "browser_probe.json");
const GENERATED_IMAGE_SELECTOR = "img[alt=\"Generated image\"]";
const CDP_PORT = 9222;
const BETWEEN_REQUESTS_MS = 150;
const DOWNLOAD_SETTLE_TIMEOUT_MS = 90000;
const DOWNLOAD_POLL_MS = 1000;
const WINDOWS_DOWNLOADS_DIR = path.join(process.env.USERPROFILE ?? path.dirname(DOWNLOADS_DIR), "Downloads");
const MAX_2K_BATCH_SIZE = 4;

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function readDescriptionSeriesSlots(): Map<number, string> {
  try {
    const parsed = JSON.parse(fs.readFileSync(DESCRIPTIONS_PATH, "utf8")) as { descriptions?: Array<{ id?: number; series_slot?: string }> };
    return new Map(
      (parsed.descriptions ?? [])
        .filter((item) => typeof item.id === "number" && typeof item.series_slot === "string")
        .map((item) => [item.id as number, item.series_slot as string]),
    );
  } catch {
    return new Map<number, string>();
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendLog(message: string): void {
  appendAutomationLog(message);
}

function sanitizeFileStem(value: string): string {
  return value
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "flow_image";
}

function buildTargetPath(suggestedFilename: string, mediaName: string, mode: "2K" | "1X"): string {
  const parsed = path.parse(suggestedFilename || "flow_image.png");
  const stem = sanitizeFileStem(parsed.name || "flow_image");
  const ext = parsed.ext || ".png";
  const dir = path.join(DOWNLOADS_DIR, dateFolderName());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${stem}__${mode}__${mediaName}${ext}`);
}

function extractMediaNameFromPath(filePath: string): string | null {
  const stem = path.parse(filePath).name;
  const match = stem.match(/__([0-9a-f-]{36})$/i);
  return match ? match[1] : null;
}

function getDownloadedMediaFromProjectFiles(): Set<string> {
  const dir = path.join(DOWNLOADS_DIR, dateFolderName());
  if (!fs.existsSync(dir)) {
    return new Set<string>();
  }

  const set = new Set<string>();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const mediaName = extractMediaNameFromPath(path.join(dir, entry.name));
    if (mediaName) {
      set.add(mediaName);
    }
  }
  return set;
}

function matchingBrowserDownloadNames(suggestedFilename: string): Set<string> {
  const parsed = path.parse(suggestedFilename || "download.png");
  const names = new Set<string>([`${parsed.name}${parsed.ext}`]);
  for (let index = 1; index <= 12; index += 1) {
    names.add(`${parsed.name} (${index})${parsed.ext}`);
  }
  return names;
}

function collectBrowserSavedCandidates(suggestedFilename: string, notBeforeMs: number): string[] {
  if (!fs.existsSync(WINDOWS_DOWNLOADS_DIR)) {
    return [];
  }

  const allowedNames = matchingBrowserDownloadNames(suggestedFilename);
  return fs.readdirSync(WINDOWS_DOWNLOADS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && allowedNames.has(entry.name))
    .map((entry) => path.join(WINDOWS_DOWNLOADS_DIR, entry.name))
    .filter((filePath) => {
      try {
        return fs.statSync(filePath).mtimeMs >= (notBeforeMs - 5000);
      } catch {
        return false;
      }
    })
    .sort((left, right) => {
      try {
        return fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs;
      } catch {
        return 0;
      }
    });
}

function moveBrowserSavedDownloadToProject(suggestedFilename: string, targetPath: string, notBeforeMs: number): boolean {
  for (const candidatePath of collectBrowserSavedCandidates(suggestedFilename, notBeforeMs)) {
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.renameSync(candidatePath, targetPath);
      return true;
    } catch {
      try {
        fs.copyFileSync(candidatePath, targetPath);
        fs.rmSync(candidatePath, { force: true });
        return true;
      } catch {
        // try next candidate
      }
    }
  }
  return false;
}

function removeBrowserSavedDuplicates(suggestedFilename: string, notBeforeMs: number): void {
  for (const candidatePath of collectBrowserSavedCandidates(suggestedFilename, notBeforeMs)) {
    try {
      fs.rmSync(candidatePath, { force: true });
    } catch {
      // best effort only
    }
  }
}

function chunkImages(images: GeneratedImage[], size: number): GeneratedImage[][] {
  const chunks: GeneratedImage[][] = [];
  for (let index = 0; index < images.length; index += size) {
    chunks.push(images.slice(index, index + size));
  }
  return chunks;
}

// sleep used for polling intervals where no deterministic DOM condition exists.
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function getGeneratedImages(page: Page): Promise<GeneratedImage[]> {
  return page.evaluate((selector) => {
    return Array.from(document.querySelectorAll(selector)).map((img, index) => {
      const src = img.getAttribute("src") || "";
      let mediaName = "";
      try {
        mediaName = new URL(src, window.location.href).searchParams.get("name") || "";
      } catch {
        mediaName = "";
      }
      const tile = img.closest("[data-tile-id]");
      const anchor = img.closest("a");
      const rect = img.getBoundingClientRect();
      return {
        index,
        mediaName,
        tileId: tile?.getAttribute("data-tile-id") || null,
        href: anchor?.getAttribute("href") || null,
        top: rect.top,
        left: rect.left,
      };
    }).filter((item) => item.mediaName);
  }, GENERATED_IMAGE_SELECTOR);
}

function sortNewestFirst(images: GeneratedImage[]): GeneratedImage[] {
  return [...images].sort((a, b) => {
    if (a.top !== b.top) {
      return b.top - a.top;
    }
    if (a.left !== b.left) {
      return b.left - a.left;
    }
    return b.index - a.index;
  });
}

function getCurrentBatchMediaNames(session: SessionState): Set<string> {
  const set = new Set<string>();
  for (const batch of session.active_batches ?? []) {
    for (const item of batch.rendered_media ?? []) {
      if (item?.media_name) {
        set.add(item.media_name);
      }
    }
  }
  for (const item of session.last_render_batch?.rendered_media ?? []) {
    if (item?.media_name) {
      set.add(item.media_name);
    }
  }
  for (const mediaName of session.current_16x9_rendered ?? []) {
    if (mediaName) {
      set.add(mediaName);
    }
  }
  for (const mediaName of session.current_1x1_rendered ?? []) {
    if (mediaName) {
      set.add(mediaName);
    }
  }
  return set;
}

function getCurrentBatchTargets(session: SessionState): Map<string, CurrentBatchTarget> {
  const map = new Map<string, CurrentBatchTarget>();
  for (const batch of session.active_batches ?? []) {
    for (const item of batch.rendered_media ?? []) {
      if (item?.media_name) {
        map.set(item.media_name, {
          media_name: item.media_name,
          prompt_id: item.prompt_id ?? null,
          href: item.href ?? null,
          tile_id: item.tile_id ?? null,
        });
      }
    }
  }
  for (const item of session.last_render_batch?.rendered_media ?? []) {
    if (item?.media_name) {
      map.set(item.media_name, {
        media_name: item.media_name,
        prompt_id: item.prompt_id ?? null,
        href: item.href ?? null,
        tile_id: item.tile_id ?? null,
      });
    }
  }
  return map;
}

function inferSeriesSlotFromSuggestedFilename(suggestedFilename: string | undefined): string | null {
  const stem = String(suggestedFilename ?? "").toLowerCase();
  if (!stem) {
    return null;
  }
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

function getSessionRunBaseline(session: SessionState): Set<string> {
  return new Set((session.run_baseline_media_names ?? []).filter(Boolean));
}

async function openDownloadSubmenu(page: Page, mediaName: string): Promise<boolean> {
  return page.evaluate(async (targetMediaName) => {
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // Short debounce to allow UI state reset before locating target image
    await new Promise((resolve) => setTimeout(resolve, 40));
    const images = Array.from(document.querySelectorAll("img[alt=\"Generated image\"]"));
    const target = images.find((img) => {
      const src = img.getAttribute("src") || "";
      try {
        return new URL(src, window.location.href).searchParams.get("name") === targetMediaName;
      } catch {
        return false;
      }
    }) as HTMLImageElement | undefined;
    if (!target) return false;
    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: rect.left + rect.width / 2,
    }));

    // Wait for context menu to appear after right-click
    await new Promise((resolve) => setTimeout(resolve, 120));
    const downloadItem = Array.from(document.querySelectorAll("[role=\"menuitem\"]"))
      .find((el) => (el.textContent || "").includes("Download")) as HTMLElement | undefined;
    if (!downloadItem) return false;
    downloadItem.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));

    // Wait for download submenu to open
    await new Promise((resolve) => setTimeout(resolve, 100));
    return true;
  }, mediaName);
}

async function clickDownloadOption(page: Page, mode: "2K" | "1X"): Promise<boolean> {
  return page.evaluate((label) => {
    const option = Array.from(document.querySelectorAll("[role=\"menuitem\"]"))
      .find((el) => {
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        return label === "2K"
          ? text.includes("2K")
          : text.includes("1K") || text.includes("Original size");
      }) as HTMLElement | undefined;
    if (!option) return false;
    option.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    return true;
  }, mode);
}

async function captureToastText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const text = document.body.innerText;
    if (text.includes("Upscaling complete, your image has been downloaded!")) {
      return "Upscaling complete, your image has been downloaded!";
    }
    return null;
  });
}

async function captureToastTextSafe(page: Page): Promise<string | null> {
  try {
    return await captureToastText(page);
  } catch {
    return null;
  }
}

function shouldQueueFifoPrepare(session: SessionState): boolean {
  return session.post_download_policy === "fifo_upscale_prepare";
}

function queueFifoPrepare(savedPath: string): void {
  import("../upscale/run_pipeline").then(m => m.runFifoPipeline(savedPath)).catch(err => console.error(err));
}

function removeImageAndSidecar(filePath: string | null | undefined): void {
  const target = String(filePath ?? "").trim();
  if (!target) {
    return;
  }
  try {
    fs.rmSync(target, { force: true });
  } catch {
    // best effort only
  }
  try {
    const sidecarPath = resolveExistingSidecarPath(target);
    if (sidecarPath) {
      fs.rmSync(sidecarPath, { force: true });
    }
  } catch {
    // best effort only
  }
}

function writeAiSidecarIfPossible(session: SessionState, image: GeneratedImage, savedPath: string, suggestedFilename: string, downloadedAt: string): number | null {
  const promptId = resolvePromptIdForDownload(session, image.mediaName, suggestedFilename, {
    downloadedAt,
  });
  if (promptId == null) {
    appendLog(`AI sidecar deferred for ${image.mediaName}: prompt_id not found in session batch state.`);
    return null;
  }
  const payload = buildAiMetadataContext({
    imagePath: savedPath,
    mediaName: image.mediaName,
    promptId,
    downloadedAt,
    modelUsed: session.current_model ?? "Nano Banana 2 / Flow",
  });
  const sidecarPath = sidecarPathForImage(savedPath);
  writeJson(sidecarPath, payload);
  appendLog(`AI sidecar written immediately for ${image.mediaName} using prompt ${promptId}.`);
  return promptId;
}

function markDownloaded(session: SessionState, image: GeneratedImage, saved: SavedDownload, note: string): void {
  const downloaded = Array.isArray(session.downloaded_images) ? session.downloaded_images : [];
  const downloadedAt = jsonTimestamp();
  const promptId = writeAiSidecarIfPossible(session, image, saved.savedPath, saved.suggestedFilename, downloadedAt);
  const existingIndex = downloaded.findIndex((item) => item.media_name === image.mediaName);
  if (existingIndex >= 0) {
    const existing = downloaded[existingIndex];
    const existingMode = String(existing.download_mode ?? "");
    const shouldReplace = existingMode !== "2K" && saved.mode === "2K";
    if (!shouldReplace) {
      appendLog(`Skipping duplicate download record for ${image.mediaName}; existing mode=${existingMode || "unknown"}, incoming mode=${saved.mode}.`);
      removeImageAndSidecar(saved.savedPath);
      return;
    }
    removeImageAndSidecar(existing.saved_path);
    downloaded.splice(existingIndex, 1);
    appendLog(`Replacing prior ${existingMode || "unknown"} record for ${image.mediaName} with ${saved.mode}.`);
  }

  downloaded.push({
    media_name: image.mediaName,
    prompt_id: promptId,
    saved_path: saved.savedPath,
    suggested_filename: saved.suggestedFilename,
    download_attempt: saved.attempt,
    downloaded_at: downloadedAt,
    download_mode: saved.mode,
    note,
    href: image.href,
    tile_id: image.tileId,
    project_id: session.current_project_id ?? null,
  });
  session.downloaded_images = downloaded;
  session.images_downloaded_count = downloaded.length;
  if (shouldQueueFifoPrepare(session)) {
    queueFifoPrepare(saved.savedPath);
    appendLog(`Queued FIFO prepare for ${image.mediaName} -> ${saved.savedPath}`);
  }
}

async function submitPass(
  page: Page,
  session: SessionState,
  images: GeneratedImage[],
  mode: "2K" | "1X",
  attempt: number,
): Promise<Map<string, SavedDownload>> {
  const expected = images.slice();
  const expectedByMedia = new Map(expected.map((image) => [image.mediaName, image]));
  const currentBatchTargets = getCurrentBatchTargets(session);
  const descriptionSeriesSlots = readDescriptionSeriesSlots();
  const expectedBySeriesSlot = new Map<string, GeneratedImage>();
  for (const image of expected) {
    const promptId = currentBatchTargets.get(image.mediaName)?.prompt_id;
    const seriesSlot = typeof promptId === "number" ? descriptionSeriesSlots.get(promptId) : null;
    if (seriesSlot) {
      expectedBySeriesSlot.set(seriesSlot, image);
    }
  }
  const requestStartedAtByMedia = new Map<string, number>();
  const completed = new Map<string, SavedDownload>();
  let eventIndex = 0;

  const handler = async (download: Download) => {
    let current: GeneratedImage | undefined;
    const downloadUrl = typeof download.url === "function" ? download.url() : "";
    if (downloadUrl) {
      try {
        const parsed = new URL(downloadUrl);
        const mediaNameFromUrl = parsed.searchParams.get("name") || "";
        if (mediaNameFromUrl) {
          current = expectedByMedia.get(mediaNameFromUrl);
        }
      } catch {
        current = undefined;
      }
    }
    const suggestedFilename = download.suggestedFilename();
    if (!current) {
      const inferredSeriesSlot = inferSeriesSlotFromSuggestedFilename(suggestedFilename);
      if (inferredSeriesSlot) {
        current = expectedBySeriesSlot.get(inferredSeriesSlot);
      }
    }
    if (!current) {
      current = expected[eventIndex];
      eventIndex += 1;
    }
    if (!current) {
      return;
    }
    const savedPath = buildTargetPath(suggestedFilename, current.mediaName, mode);
    const requestStartedAt = requestStartedAtByMedia.get(current.mediaName) ?? Date.now();
    try {
      await download.saveAs(savedPath);
    } catch (error) {
      if (!moveBrowserSavedDownloadToProject(suggestedFilename, savedPath, requestStartedAt)) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog(`${mode} download saveAs failed for ${current.mediaName} on attempt ${attempt}: ${message}`);
        return;
      }
      appendLog(`${mode} download recovered from browser download folder for ${current.mediaName} on attempt ${attempt}.`);
    }
    const failure = await download.failure();
    if (failure) {
      appendLog(`${mode} download reported failure for ${current.mediaName} on attempt ${attempt}: ${failure}`);
      return;
    }
    removeBrowserSavedDuplicates(suggestedFilename, requestStartedAt);
    completed.set(current.mediaName, {
      image: current,
      mode,
      attempt,
      savedPath,
      suggestedFilename,
      toastText: null,
    });
  };

  page.on("download", handler);

  try {
    for (const image of images) {
      const opened = await openDownloadSubmenu(page, image.mediaName);
      if (!opened) {
        appendLog(`Could not open download menu for ${image.mediaName} during ${mode} attempt ${attempt}.`);
        continue;
      }
      requestStartedAtByMedia.set(image.mediaName, Date.now());
      const clicked = await clickDownloadOption(page, mode);
      if (!clicked) {
        appendLog(`Could not click ${mode} option for ${image.mediaName} during attempt ${attempt}.`);
        continue;
      }
      appendLog(`${mode} request submitted for ${image.mediaName} on attempt ${attempt}.`);
      await sleep(BETWEEN_REQUESTS_MS);
    }

    const deadline = Date.now() + DOWNLOAD_SETTLE_TIMEOUT_MS;
    while (Date.now() < deadline && completed.size < images.length) {
      await sleep(DOWNLOAD_POLL_MS);
    }

    for (const saved of completed.values()) {
      saved.toastText = await captureToastTextSafe(page);
    }
  } finally {
    page.off("download", handler);
  }

  return completed;
}

async function main(): Promise<void> {
  if (!(await isDebugPortReady(CDP_PORT))) {
    throw new Error(`CDP port ${CDP_PORT} is not ready.`);
  }

  const session = readJson<SessionState>(SESSION_STATE_PATH, {});
  const browserProbe = readJson<BrowserProbe>(BROWSER_PROBE_PATH, {
    cdp_port: CDP_PORT,
    downloads: [],
    evidence: [],
  });

  const browser = await connectBrowser(CDP_PORT);
  const urlPattern = session.current_project_id ? `/fx/tools/flow/project/${session.current_project_id}` : "/fx/tools/flow";
  const openUrl = session.current_project_url || "https://labs.google/fx/tools/flow";
  const page = await getOrOpenPage(browser, urlPattern, openUrl);
  await page.bringToFront();

  const allImages = sortNewestFirst(await getGeneratedImages(page));
  const downloadedSet = new Set([
    ...(session.downloaded_images ?? []).map((item) => item.media_name),
    ...getDownloadedMediaFromProjectFiles(),
  ]);
  const sessionRunBaseline = getSessionRunBaseline(session);
  const currentBatchMediaNames = getCurrentBatchMediaNames(session);
  const currentBatchTargets = getCurrentBatchTargets(session);
  const sessionRunPending = sessionRunBaseline.size
    ? allImages.filter((image) => !sessionRunBaseline.has(image.mediaName) && !downloadedSet.has(image.mediaName))
    : [];
  let pending = sessionRunPending.length
    ? sessionRunPending
    : allImages.filter((image) =>
    currentBatchMediaNames.has(image.mediaName)
      && !downloadedSet.has(image.mediaName)
      && (() => {
        const target = currentBatchTargets.get(image.mediaName);
        if (!target) {
          return true;
        }
        if (target.tile_id && image.tileId && target.tile_id !== image.tileId) {
          return false;
        }
        if (target.href && image.href && target.href !== image.href) {
          return false;
        }
        return true;
      })(),
  );
  if (!pending.length && currentBatchMediaNames.size === 0 && !sessionRunBaseline.size) {
    pending = allImages.filter((image) => !downloadedSet.has(image.mediaName));
  }
  if (!pending.length) {
    appendLog(`No new Flow images needed non-blocking download on project ${session.current_project_id ?? "unknown"}.`);
    return;
  }

  for (const image of pending) {
    appendLog(`Preflight exact download target media=${image.mediaName} tile=${image.tileId ?? "null"} href=${image.href ?? "null"} gridTop=${image.top} gridLeft=${image.left}`);
  }

  const allSaved: SavedDownload[] = [];
  const finalMissing: GeneratedImage[] = [];

  for (const chunk of chunkImages(pending, MAX_2K_BATCH_SIZE)) {
    const pass1 = await submitPass(page, session, chunk, "2K", 1);
    const missingAfterPass1 = chunk.filter((image) => !pass1.has(image.mediaName));
    for (const image of missingAfterPass1) {
      appendLog(`2K attempt 1 produced no saved download for ${image.mediaName}.`);
    }

    const pass2 = missingAfterPass1.length ? await submitPass(page, session, missingAfterPass1, "2K", 2) : new Map<string, SavedDownload>();
    const missingAfterPass2 = missingAfterPass1.filter((image) => !pass2.has(image.mediaName));
    for (const image of missingAfterPass2) {
      appendLog(`2K attempt 2 produced no saved download for ${image.mediaName}. Falling back to 1X.`);
    }

    const fallbackPass = missingAfterPass2.length ? await submitPass(page, session, missingAfterPass2, "1X", 1) : new Map<string, SavedDownload>();
    const chunkMissing = missingAfterPass2.filter((image) => !fallbackPass.has(image.mediaName));
    for (const image of chunkMissing) {
      appendLog(`1X fallback also failed for ${image.mediaName}.`);
      session.errors = [...(session.errors ?? []), `1X fallback failed for ${image.mediaName}.`];
    }

    allSaved.push(...pass1.values(), ...pass2.values(), ...fallbackPass.values());
    finalMissing.push(...chunkMissing);
  }

  for (const saved of allSaved) {
    const note = saved.mode === "1X"
      ? "2K failed twice; downloaded 1X fallback."
      : (saved.toastText ?? "Upscaling complete, your image has been downloaded!");
    markDownloaded(session, saved.image, saved, note);
    browserProbe.downloads = [
      ...(browserProbe.downloads ?? []),
      {
        media_name: saved.image.mediaName,
        mode: saved.mode,
        attempts: saved.attempt,
        saved_path: saved.savedPath,
        checked_at: jsonTimestamp(),
      },
    ];
  }

  session.current_step = finalMissing.length ? "STEP_DOWNLOADS_PARTIAL_FAILURE" : "STEP_DOWNLOADS_COMPLETED";
  writeJson(SESSION_STATE_PATH, session);

  browserProbe.cdp_port = CDP_PORT;
  browserProbe.checked_at = jsonTimestamp();
  browserProbe.status = finalMissing.length ? "downloads_partial_failure" : "downloads_completed";
  browserProbe.page_url = page.url();
  browserProbe.project_id = session.current_project_id ?? null;
  browserProbe.evidence = [
    ...(browserProbe.evidence ?? []),
    `Submitted non-blocking download requests for ${pending.length} Flow image(s). Saved ${allSaved.length}.`,
  ];
  writeJson(BROWSER_PROBE_PATH, browserProbe);
}

main().then(() => process.exit(0)).catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  appendLog(`Non-blocking Flow download worker failed: ${message}`);
  console.error(message);
  process.exit(1);
});
