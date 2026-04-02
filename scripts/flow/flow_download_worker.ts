import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Download, Page } from "playwright";
import {
  connectBrowser,
  getOrOpenPage,
  isDebugPortReady,
  screenshotElement,
  waitForElement,
} from "../../../../../browser-automation-core/browser_core";
import { quarantineFailedAsset } from "../common/failed_assets";
import { buildAiMetadataContext } from "../common/ai_metadata";
import { appendAutomationLog } from "../common/logging";
import { resolvePromptIdForDownload } from "../common/prompt_resolution";
import { sidecarPathForImage } from "../common/sidecars";
import {
  AUTOMATION_LOG_PATH,
  DATA_DIR,
  DESCRIPTIONS_PATH,
  DOWNLOADS_DIR,
  LOGS_DIR,
  SCREENSHOTS_DIR,
  SESSION_STATE_PATH,
} from "../project_paths";
import { dateFolderName, jsonTimestamp } from "../common/time";

type Json = Record<string, unknown>;

type SessionState = {
  session_date?: string;
  current_project_url?: string;
  current_project_id?: string;
  pipeline_mode?: string;
  post_download_policy?: string;
  loop_index?: number;
  current_model?: string;
  current_step?: string;
  images_downloaded_count?: number;
  downloaded_images?: Json[];
  run_baseline_media_names?: string[];
  active_batches?: Array<{
    batch_id?: string;
    prompt_ids?: number[];
    aspect_ratio?: string;
    rendered_media?: Array<{
      prompt_id?: number | null;
      media_name?: string;
      href?: string | null;
      tile_id?: string | null;
    }>;
  }>;
  errors?: string[];
  current_16x9_rendered?: string[];
  current_1x1_rendered?: string[];
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

type Description = {
  id: number;
  trend_topic?: string;
  series_slot?: string;
};

type SelectorRegistry = {
  selectors_discovered?: boolean;
  discovery_note?: string;
  selectors?: Record<string, Json>;
};

type BrowserProbe = {
  cdp_port?: number;
  checked_at?: string;
  status?: string;
  page_url?: string;
  project_id?: string;
  evidence?: string[];
  high_demand_banner?: string;
  downloads?: Json[];
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
  href?: string | null;
  tile_id?: string | null;
};

type DownloadAttemptResult =
  | {
      ok: true;
      mode: "2K" | "1X";
      suggestedFilename: string;
      savedPath: string;
      attempt: number;
      toastText: string | null;
    }
  | {
      ok: false;
      mode: "2K" | "1X";
      attempt: number;
      reason: string;
      bodySnippet: string;
      savedPath?: string | null;
    };

const ROOT = process.cwd();
const SELECTORS_REGISTRY_PATH = path.join(DATA_DIR, "selectors_registry.json");
const BROWSER_PROBE_PATH = path.join(DATA_DIR, "browser_probe.json");
const UPSCALE_RUNTIME_PATH = path.join(ROOT, "scripts", "upscale_runtime.ps1");
const CDP_PORT = 9222;
const GENERATED_IMAGE_SELECTOR = "img[alt=\"Generated image\"]";

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonFile(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendLog(line: string): void {
  appendAutomationLog(line.replace(/^\d{4}-\d{2}-\d{2}(?:__|\s{1,2})\d{2}:\d{2}:\d{2}(?: [AP]M)?\s+/, ""));
}

function timestampIso(): string {
  return jsonTimestamp();
}

function sanitizeFileStem(value: string): string {
  return value
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "flow_image";
}

function compactTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

function buildTargetPath(suggestedFilename: string, mediaName: string, mode: "2K" | "1X", deterministicStem?: string | null): string {
  const parsed = path.parse(suggestedFilename || "flow_image.png");
  const stem = sanitizeFileStem(deterministicStem || parsed.name || "flow_image");
  const ext = parsed.ext || ".png";
  const dir = path.join(DOWNLOADS_DIR, dateFolderName());
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${stem}__${mode}__${mediaName}${ext}`);
}

function writeFailureRecord(
  mediaName: string,
  reasonCode: string,
  reasonDetail: string,
  bodySnippet: string,
  mode: string,
  savedPath?: string | null,
): void {
  quarantineFailedAsset({
    assetKey: mediaName,
    reasonCode,
    reasonDetail,
    relatedPaths: [savedPath],
    timestamp: timestampIso(),
    extra: {
      media_name: mediaName,
      mode,
      body_snippet: bodySnippet,
      source_stage: "02_IMAGE_CREATION",
      source_worker: "flow_download_worker",
      failed_image_path: savedPath ? path.basename(savedPath) : null,
    },
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureSelectors(page: Page): Promise<SelectorRegistry> {
  const registry = readJsonFile<SelectorRegistry>(SELECTORS_REGISTRY_PATH, {
    selectors_discovered: false,
    discovery_note: "Flow selectors not discovered yet.",
    selectors: {},
  });

  const selectors = { ...(registry.selectors ?? {}) };
  let changed = false;

  if (!selectors.generated_image) {
    selectors.generated_image = {
      selector: GENERATED_IMAGE_SELECTOR,
      description: "Generated image tiles on the Flow project page",
      validated_on: timestampIso(),
    };
    changed = true;
  }

  if (!selectors.download_menuitem) {
    selectors.download_menuitem = {
      selector: "[role=\"menuitem\"][aria-controls]",
      description: "Context-menu item that expands the download submenu",
      validated_on: timestampIso(),
    };
    changed = true;
  }

  if (!selectors.download_2k_option) {
    selectors.download_2k_option = {
      description: "Context-menu submenu item whose text contains 2K",
      validated_on: timestampIso(),
    };
    changed = true;
  }

  if (!selectors.download_1x_option) {
    selectors.download_1x_option = {
      description: "Context-menu submenu item whose text contains 1K Original size",
      validated_on: timestampIso(),
    };
    changed = true;
  }

  if (changed) {
    const updated: SelectorRegistry = {
      selectors_discovered: true,
      discovery_note: `Flow download selectors validated from ${page.url()} at ${timestampIso()}`,
      selectors,
    };
    writeJsonFile(SELECTORS_REGISTRY_PATH, updated);
    return updated;
  }

  return registry;
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
        href: item.href ?? null,
        tile_id: item.tile_id ?? null,
      });
    }
  }
  return map;
}

function getSessionRunBaseline(session: SessionState): Set<string> {
  return new Set((session.run_baseline_media_names ?? []).filter(Boolean));
}

function buildDeterministicStem(
  mediaName: string,
  session: SessionState,
  currentBatchTargets: Map<string, CurrentBatchTarget>,
  descriptionsById: Map<number, Description>,
): string | null {
  const renderedMedia = [
    ...((session.active_batches ?? []).flatMap((batch) => batch.rendered_media ?? [])),
    ...(session.last_render_batch?.rendered_media ?? []),
  ];
  const promptInfo = renderedMedia.find((item) => item.media_name === mediaName);
  const promptId = typeof promptInfo?.prompt_id === "number" ? promptInfo.prompt_id : null;
  if (promptId == null) {
    return null;
  }
  const description = descriptionsById.get(promptId);
  const trendSlug = sanitizeFileStem(description?.trend_topic || "flow_image");
  const seriesSlot = sanitizeFileStem(description?.series_slot || "slot");
  const loopIndex = String(session.loop_index ?? 1).padStart(3, "0");
  return `${trendSlug}_${seriesSlot}_L${loopIndex}_${compactTimestamp()}`;
}

async function openDownloadSubmenu(page: Page, mediaName: string): Promise<{ ok: boolean; error?: string; options?: string[] }> {
  return page.evaluate(async (targetMediaName) => {
    document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const images = Array.from(document.querySelectorAll("img[alt=\"Generated image\"]"));
    const target = images.find((img) => {
      const src = img.getAttribute("src") || "";
      try {
        return new URL(src, window.location.href).searchParams.get("name") === targetMediaName;
      } catch {
        return false;
      }
    }) as HTMLImageElement | undefined;

    if (!target) {
      return { ok: false, error: `Image tile not found for ${targetMediaName}` };
    }

    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    target.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 2,
      buttons: 2,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));

    await new Promise((resolve) => setTimeout(resolve, 250));

    const downloadItem = Array.from(document.querySelectorAll("[role=\"menuitem\"]"))
      .find((el) => (el.textContent || "").includes("Download")) as HTMLElement | undefined;

    if (!downloadItem) {
      return { ok: false, error: "Download menu item not found" };
    }

    downloadItem.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));

    await new Promise((resolve) => setTimeout(resolve, 250));

    const options = Array.from(document.querySelectorAll("[role=\"menuitem\"]"))
      .map((el) => (el.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    return { ok: true, options };
  }, mediaName);
}

async function clickDownloadOption(page: Page, optionLabel: "2K" | "1K"): Promise<{ ok: boolean; error?: string }> {
  return page.evaluate((label) => {
    const option = Array.from(document.querySelectorAll("[role=\"menuitem\"]"))
      .find((el) => {
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        return label === "2K"
          ? text.includes("2K")
          : text.includes("1K") || text.includes("Original size");
      }) as HTMLElement | undefined;

    if (!option) {
      return { ok: false, error: `${label} menu option not found` };
    }

    option.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));

    return { ok: true };
  }, optionLabel);
}

async function captureBodySnippet(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 1500));
}

async function captureToastText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const text = document.body.innerText;
    if (text.includes("Upscaling complete, your image has been downloaded!")) {
      return "Upscaling complete, your image has been downloaded!";
    }
    if (text.includes("downloaded")) {
      return text.slice(0, 400);
    }
    return null;
  });
}

async function performDownloadAttempt(
  page: Page,
  image: GeneratedImage,
  mode: "2K" | "1X",
  attempt: number,
): Promise<DownloadAttemptResult> {
  const openResult = await openDownloadSubmenu(page, image.mediaName);
  if (!openResult.ok) {
    return {
      ok: false,
      mode,
      attempt,
      reason: openResult.error ?? "Download submenu could not be opened",
      bodySnippet: await captureBodySnippet(page),
    };
  }

  const optionResult = await clickDownloadOption(page, mode === "2K" ? "2K" : "1K");
  if (!optionResult.ok) {
    return {
      ok: false,
      mode,
      attempt,
      reason: optionResult.error ?? `${mode} option click failed`,
      bodySnippet: await captureBodySnippet(page),
    };
  }

  let download: Download;
  try {
    download = await page.waitForEvent("download", { timeout: mode === "2K" ? 30000 : 15000 });
  } catch (error) {
    return {
      ok: false,
      mode,
      attempt,
      reason: error instanceof Error ? error.message : String(error),
      bodySnippet: await captureBodySnippet(page),
    };
  }

  const suggestedFilename = download.suggestedFilename();
  const savedPath = buildTargetPath(suggestedFilename, image.mediaName, mode);
  await download.saveAs(savedPath);
  const failure = await download.failure();
  if (failure) {
    return {
      ok: false,
      mode,
      attempt,
      reason: failure,
      bodySnippet: await captureBodySnippet(page),
      savedPath,
    };
  }

  return {
    ok: true,
    mode,
    attempt,
    suggestedFilename,
    savedPath,
    toastText: await captureToastText(page),
  };
}

function markDownloaded(session: SessionState, image: GeneratedImage, result: Extract<DownloadAttemptResult, { ok: true }>, note: string | null): void {
  const downloaded = Array.isArray(session.downloaded_images) ? session.downloaded_images : [];
  const downloadedAt = timestampIso();
  const promptId = writeAiSidecarIfPossible(session, image.mediaName, result.savedPath, result.suggestedFilename, downloadedAt);
  downloaded.push({
    media_name: image.mediaName,
    prompt_id: promptId,
    tile_id: image.tileId,
    href: image.href,
    project_id: session.current_project_id ?? null,
    download_mode: result.mode,
    saved_path: result.savedPath,
    suggested_filename: result.suggestedFilename,
    download_attempt: result.attempt,
    downloaded_at: downloadedAt,
    note,
  });
  session.downloaded_images = downloaded;
  session.images_downloaded_count = downloaded.length;
  if (session.post_download_policy === "fifo_upscale_prepare") {
    spawn(
      "powershell",
      [
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        UPSCALE_RUNTIME_PATH,
        "-Action",
        "fifo",
        "-ImagePath",
        result.savedPath,
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    ).unref();
    appendLog(`${timestampIso()} Queued FIFO prepare for ${image.mediaName} -> ${result.savedPath}.`);
  }
}

function writeAiSidecarIfPossible(session: SessionState, mediaName: string, savedPath: string, suggestedFilename: string, downloadedAt: string): number | null {
  const promptId = resolvePromptIdForDownload(session, mediaName, suggestedFilename, {
    downloadedAt,
  });
  if (promptId == null) {
    appendLog(`${timestampIso()} AI sidecar deferred for ${mediaName}: prompt_id not found in batch state.`);
    return null;
  }
  const payload = buildAiMetadataContext({
    imagePath: savedPath,
    mediaName,
    promptId,
    downloadedAt,
    modelUsed: session.current_model ?? "Nano Banana 2 / Flow",
  });
  writeJsonFile(sidecarPathForImage(savedPath), payload);
  appendLog(`${timestampIso()} AI sidecar written immediately for ${mediaName} using prompt ${promptId}.`);
  return promptId;
}

async function main(): Promise<void> {
  if (!(await isDebugPortReady(CDP_PORT))) {
    throw new Error(`CDP port ${CDP_PORT} is not available. Run C:\\Users\\11\\browser-automation-core\\launch_browser.bat first.`);
  }

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const session = readJsonFile<SessionState>(SESSION_STATE_PATH, {});
  const descriptionsPayload = readJsonFile<{ descriptions?: Description[] }>(DESCRIPTIONS_PATH, { descriptions: [] });
  const descriptionsById = new Map((descriptionsPayload.descriptions ?? []).map((item) => [item.id, item]));
  const browserProbe = readJsonFile<BrowserProbe>(BROWSER_PROBE_PATH, {
    cdp_port: CDP_PORT,
    evidence: [],
    downloads: [],
  });

  const browser = await connectBrowser(CDP_PORT);
  const urlPattern = session.current_project_id
    ? `/fx/tools/flow/project/${session.current_project_id}`
    : "/fx/tools/flow";
  const openUrl = session.current_project_url || "https://labs.google/fx/tools/flow";
  const page = await getOrOpenPage(browser, urlPattern, openUrl);

  await page.bringToFront();
  await page.waitForLoadState("domcontentloaded");

  const hasImages = await waitForElement(page, GENERATED_IMAGE_SELECTOR, 15000);
  if (!hasImages) {
    throw new Error("No generated image tiles were found on the current Flow project page.");
  }

  await ensureSelectors(page);

  const allImages = sortNewestFirst(await getGeneratedImages(page));
  const alreadyDownloaded = new Set(
    (session.downloaded_images ?? [])
      .map((item) => String((item as Json).media_name ?? ""))
      .filter(Boolean),
  );
  const sessionRunBaseline = getSessionRunBaseline(session);
  const currentBatchMediaNames = getCurrentBatchMediaNames(session);
  const currentBatchTargets = getCurrentBatchTargets(session);
  const sessionRunPending = sessionRunBaseline.size
    ? allImages.filter((image) => !sessionRunBaseline.has(image.mediaName) && !alreadyDownloaded.has(image.mediaName))
    : [];
  const pendingImages = (sessionRunPending.length
    ? sessionRunPending
    : currentBatchMediaNames.size
    ? allImages.filter((image) => {
      if (!currentBatchMediaNames.has(image.mediaName)) {
        return false;
      }
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
    })
    : allImages
  ).filter((image) => !alreadyDownloaded.has(image.mediaName));

  if (!pendingImages.length) {
    appendLog(`${timestampIso()} No new Flow images needed downloading on project ${session.current_project_id ?? "unknown"}.`);
    return;
  }

  const results: Json[] = [];

  for (const image of pendingImages) {
    appendLog(`${timestampIso()} Preflight exact download target media=${image.mediaName} tile=${image.tileId ?? "null"} href=${image.href ?? "null"} gridTop=${image.top} gridLeft=${image.left}`);
    const screenshotPath = path.join(SCREENSHOTS_DIR, `${image.mediaName}.png`);
    await screenshotElement(page, GENERATED_IMAGE_SELECTOR, screenshotPath);
    const deterministicStem = buildDeterministicStem(image.mediaName, session, currentBatchTargets, descriptionsById);

    let completed = false;
    let lastFailure: DownloadAttemptResult | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await performDownloadAttempt(page, image, "2K", attempt);
      if (result.ok) {
        if (deterministicStem) {
          const desiredPath = buildTargetPath(result.suggestedFilename, image.mediaName, result.mode, deterministicStem);
          if (result.savedPath !== desiredPath) {
            if (fs.existsSync(result.savedPath)) {
              fs.renameSync(result.savedPath, desiredPath);
            }
            result.savedPath = desiredPath;
          }
        }
        const note = result.toastText ?? "2K upscaled download completed successfully.";
        markDownloaded(session, image, result, note);
        results.push({
          media_name: image.mediaName,
          mode: "2K",
          attempts: attempt,
          saved_path: result.savedPath,
        });
        browserProbe.downloads = [...(browserProbe.downloads ?? []), {
          media_name: image.mediaName,
          mode: "2K",
          attempts: attempt,
          saved_path: result.savedPath,
          checked_at: timestampIso(),
        }];
        appendLog(`${timestampIso()} 2K download succeeded for ${image.mediaName} on attempt ${attempt}. Saved to ${result.savedPath}.`);
        completed = true;
        break;
      }

      lastFailure = result;
      appendLog(`${timestampIso()} 2K download attempt ${attempt} failed for ${image.mediaName}: ${result.reason}`);
      await sleep(1200);
    }

    if (completed) {
      continue;
    }

    const fallbackResult = await performDownloadAttempt(page, image, "1X", 1);
    if (fallbackResult.ok) {
      if (deterministicStem) {
        const desiredPath = buildTargetPath(fallbackResult.suggestedFilename, image.mediaName, fallbackResult.mode, deterministicStem);
        if (fallbackResult.savedPath !== desiredPath) {
          if (fs.existsSync(fallbackResult.savedPath)) {
            fs.renameSync(fallbackResult.savedPath, desiredPath);
          }
          fallbackResult.savedPath = desiredPath;
        }
      }
      const note = `2K failed twice; downloaded 1X fallback. ${fallbackResult.toastText ?? ""}`.trim();
      markDownloaded(session, image, fallbackResult, note);
      results.push({
        media_name: image.mediaName,
        mode: "1X",
        attempts: 1,
        saved_path: fallbackResult.savedPath,
        fallback_after_2k_failures: true,
      });
      browserProbe.downloads = [...(browserProbe.downloads ?? []), {
        media_name: image.mediaName,
        mode: "1X",
        attempts: 1,
        saved_path: fallbackResult.savedPath,
        checked_at: timestampIso(),
        fallback_after_2k_failures: true,
      }];
      appendLog(`${timestampIso()} 2K failed twice for ${image.mediaName}. Downloaded 1X fallback to ${fallbackResult.savedPath}.`);
      session.errors = [...(session.errors ?? []), `2K failed twice for ${image.mediaName}; downloaded 1X fallback.`];
      continue;
    }

    const failureReason = [
      lastFailure?.reason ? `last 2K failure: ${lastFailure.reason}` : null,
      `1X fallback failure: ${fallbackResult.reason}`,
    ].filter(Boolean).join(" | ");

    appendLog(`${timestampIso()} Download failed for ${image.mediaName}. ${failureReason}`);
    writeFailureRecord(
      image.mediaName,
      "image_download_failed",
      failureReason,
      fallbackResult.bodySnippet,
      "download",
      fallbackResult.savedPath,
    );
    session.errors = [...(session.errors ?? []), `Download failed for ${image.mediaName}: ${failureReason}`];
    results.push({
      media_name: image.mediaName,
      mode: "failed",
      reason: failureReason,
      body_snippet: fallbackResult.bodySnippet,
    });
  }

  session.current_step = "STEP_FLOW_DOWNLOADS_COMPLETED";
  writeJsonFile(SESSION_STATE_PATH, session);

  browserProbe.cdp_port = CDP_PORT;
  browserProbe.checked_at = timestampIso();
  browserProbe.status = results.some((item) => item.mode === "failed")
    ? "downloads_partial_failure"
    : "downloads_completed";
  browserProbe.page_url = page.url();
  browserProbe.project_id = session.current_project_id ?? null;
  browserProbe.evidence = [
    ...(browserProbe.evidence ?? []),
    `Downloaded ${results.filter((item) => item.mode === "2K" || item.mode === "1X").length} pending Flow image(s) from project ${session.current_project_id ?? "unknown"}.`,
  ];
  writeJsonFile(BROWSER_PROBE_PATH, browserProbe);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    appendLog(`${timestampIso()} Flow download worker failed: ${message}`);
    console.error(message);
    process.exit(1);
  });
