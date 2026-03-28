import fs from "node:fs";
import path from "node:path";
import type { Download, Page } from "playwright";
import {
  connectBrowser,
  findPageByUrl,
  isDebugPortReady,
  screenshotElement,
  waitForElement,
} from "../../../../../browser-automation-core/browser_core";
import {
  AUTOMATION_LOG_PATH,
  DATA_DIR,
  DOWNLOADS_DIR,
  LOGS_DIR,
  SCREENSHOTS_DIR,
  SESSION_STATE_PATH,
} from "../project_paths";

type Json = Record<string, unknown>;

type SessionState = {
  session_date?: string;
  current_project_url?: string;
  current_project_id?: string;
  current_step?: string;
  images_downloaded_count?: number;
  downloaded_images?: Json[];
  errors?: string[];
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
    };

const ROOT = process.cwd();
const SELECTORS_REGISTRY_PATH = path.join(DATA_DIR, "selectors_registry.json");
const BROWSER_PROBE_PATH = path.join(DATA_DIR, "browser_probe.json");
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
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.appendFileSync(AUTOMATION_LOG_PATH, `${line}\n`, "utf8");
}

function timestampIso(): string {
  const now = new Date();
  return `${now.toISOString().slice(0, 10)}__${now.toTimeString().slice(0, 8)}`;
}

function dateFolderName(): string {
  return new Date().toISOString().slice(0, 10);
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
      return {
        index,
        mediaName,
        tileId: tile?.getAttribute("data-tile-id") || null,
        href: anchor?.getAttribute("href") || null,
      };
    }).filter((item) => item.mediaName);
  }, GENERATED_IMAGE_SELECTOR);
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
  downloaded.push({
    media_name: image.mediaName,
    tile_id: image.tileId,
    href: image.href,
    project_id: session.current_project_id ?? null,
    download_mode: result.mode,
    saved_path: result.savedPath,
    suggested_filename: result.suggestedFilename,
    download_attempt: result.attempt,
    downloaded_at: timestampIso(),
    note,
  });
  session.downloaded_images = downloaded;
  session.images_downloaded_count = downloaded.length;
}

async function main(): Promise<void> {
  if (!(await isDebugPortReady(CDP_PORT))) {
    throw new Error(`CDP port ${CDP_PORT} is not available. Run C:\\Users\\11\\browser-automation-core\\launch_browser.bat first.`);
  }

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const session = readJsonFile<SessionState>(SESSION_STATE_PATH, {});
  const browserProbe = readJsonFile<BrowserProbe>(BROWSER_PROBE_PATH, {
    cdp_port: CDP_PORT,
    evidence: [],
    downloads: [],
  });

  const browser = await connectBrowser(CDP_PORT);
  const urlPattern = session.current_project_id
    ? `/fx/tools/flow/project/${session.current_project_id}`
    : "/fx/tools/flow/project/";
  const page = findPageByUrl(browser, urlPattern);

  if (!page) {
    throw new Error(`No open Flow tab found matching ${urlPattern}`);
  }

  await page.bringToFront();
  await page.waitForLoadState("domcontentloaded");

  const hasImages = await waitForElement(page, GENERATED_IMAGE_SELECTOR, 15000);
  if (!hasImages) {
    throw new Error("No generated image tiles were found on the current Flow project page.");
  }

  await ensureSelectors(page);

  const allImages = await getGeneratedImages(page);
  const alreadyDownloaded = new Set(
    (session.downloaded_images ?? [])
      .map((item) => String((item as Json).media_name ?? ""))
      .filter(Boolean),
  );
  const pendingImages = allImages.filter((image) => !alreadyDownloaded.has(image.mediaName));

  if (!pendingImages.length) {
    appendLog(`${timestampIso()} No new Flow images needed downloading on project ${session.current_project_id ?? "unknown"}.`);
    return;
  }

  const results: Json[] = [];

  for (const image of pendingImages) {
    const screenshotPath = path.join(SCREENSHOTS_DIR, `${image.mediaName}.png`);
    await screenshotElement(page, GENERATED_IMAGE_SELECTOR, screenshotPath);

    let completed = false;
    let lastFailure: DownloadAttemptResult | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await performDownloadAttempt(page, image, "2K", attempt);
      if (result.ok) {
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
