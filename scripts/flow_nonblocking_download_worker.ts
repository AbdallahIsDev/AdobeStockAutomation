import fs from "node:fs";
import path from "node:path";
import type { Download, Page } from "playwright";
import { connectBrowser, findPageByUrl, isDebugPortReady } from "../../../../browser-automation-core/browser_core";
import { AUTOMATION_LOG_PATH, DATA_DIR, DOWNLOADS_DIR, SESSION_STATE_PATH } from "./project_paths";

type JsonRecord = Record<string, unknown>;

type DownloadedImage = {
  media_name: string;
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
  current_project_id?: string;
  current_step?: string;
  images_downloaded_count?: number;
  downloaded_images?: DownloadedImage[];
  errors?: string[];
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
  fs.appendFileSync(AUTOMATION_LOG_PATH, `${new Date().toISOString()} ${message}\n`, "utf8");
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

async function openDownloadSubmenu(page: Page, mediaName: string): Promise<boolean> {
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
      clientY: rect.top + rect.height / 2,
    }));
    await new Promise((resolve) => setTimeout(resolve, 250));
    const downloadItem = Array.from(document.querySelectorAll("[role=\"menuitem\"]"))
      .find((el) => (el.textContent || "").includes("Download")) as HTMLElement | undefined;
    if (!downloadItem) return false;
    downloadItem.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
    }));
    await new Promise((resolve) => setTimeout(resolve, 200));
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

function markDownloaded(session: SessionState, image: GeneratedImage, saved: SavedDownload, note: string): void {
  const downloaded = Array.isArray(session.downloaded_images) ? session.downloaded_images : [];
  downloaded.push({
    media_name: image.mediaName,
    saved_path: saved.savedPath,
    suggested_filename: saved.suggestedFilename,
    download_attempt: saved.attempt,
    downloaded_at: new Date().toISOString(),
    download_mode: saved.mode,
    note,
    href: image.href,
    tile_id: image.tileId,
    project_id: session.current_project_id ?? null,
  });
  session.downloaded_images = downloaded;
  session.images_downloaded_count = downloaded.length;
}

async function submitPass(
  page: Page,
  images: GeneratedImage[],
  mode: "2K" | "1X",
  attempt: number,
): Promise<Map<string, SavedDownload>> {
  const expected = images.slice();
  const completed = new Map<string, SavedDownload>();
  let eventIndex = 0;

  const handler = async (download: Download) => {
    const current = expected[eventIndex];
    eventIndex += 1;
    if (!current) {
      return;
    }
    const suggestedFilename = download.suggestedFilename();
    const savedPath = buildTargetPath(suggestedFilename, current.mediaName, mode);
    try {
      await download.saveAs(savedPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendLog(`${mode} download saveAs failed for ${current.mediaName} on attempt ${attempt}: ${message}`);
      return;
    }
    const failure = await download.failure();
    if (failure) {
      appendLog(`${mode} download reported failure for ${current.mediaName} on attempt ${attempt}: ${failure}`);
      return;
    }
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
      const clicked = await clickDownloadOption(page, mode);
      if (!clicked) {
        appendLog(`Could not click ${mode} option for ${image.mediaName} during attempt ${attempt}.`);
        continue;
      }
      appendLog(`${mode} request submitted for ${image.mediaName} on attempt ${attempt}.`);
      await sleep(1000);
    }

    const deadline = Date.now() + 90000;
    while (Date.now() < deadline && completed.size < images.length) {
      await sleep(1000);
    }

    for (const saved of completed.values()) {
      saved.toastText = await captureToastText(page);
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
  const page = findPageByUrl(browser, session.current_project_id ? `/fx/tools/flow/project/${session.current_project_id}` : "/fx/tools/flow/project/");
  if (!page) {
    throw new Error("Flow project page not found.");
  }
  await page.bringToFront();

  const allImages = await getGeneratedImages(page);
  const downloadedSet = new Set((session.downloaded_images ?? []).map((item) => item.media_name));
  let pending = allImages.filter((image) => !downloadedSet.has(image.mediaName));
  if (!pending.length) {
    appendLog(`No new Flow images needed non-blocking download on project ${session.current_project_id ?? "unknown"}.`);
    return;
  }

  const pass1 = await submitPass(page, pending, "2K", 1);
  const missingAfterPass1 = pending.filter((image) => !pass1.has(image.mediaName));
  for (const image of missingAfterPass1) {
    appendLog(`2K attempt 1 produced no saved download for ${image.mediaName}.`);
  }

  const pass2 = missingAfterPass1.length ? await submitPass(page, missingAfterPass1, "2K", 2) : new Map<string, SavedDownload>();
  const missingAfterPass2 = missingAfterPass1.filter((image) => !pass2.has(image.mediaName));
  for (const image of missingAfterPass2) {
    appendLog(`2K attempt 2 produced no saved download for ${image.mediaName}. Falling back to 1X.`);
  }

  const fallbackPass = missingAfterPass2.length ? await submitPass(page, missingAfterPass2, "1X", 1) : new Map<string, SavedDownload>();
  const finalMissing = missingAfterPass2.filter((image) => !fallbackPass.has(image.mediaName));
  for (const image of finalMissing) {
    appendLog(`1X fallback also failed for ${image.mediaName}.`);
    session.errors = [...(session.errors ?? []), `1X fallback failed for ${image.mediaName}.`];
  }

  const allSaved = [
    ...pass1.values(),
    ...pass2.values(),
    ...fallbackPass.values(),
  ];

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
        checked_at: new Date().toISOString(),
      },
    ];
  }

  session.current_step = finalMissing.length ? "STEP_DOWNLOADS_PARTIAL_FAILURE" : "STEP_DOWNLOADS_COMPLETED";
  writeJson(SESSION_STATE_PATH, session);

  browserProbe.cdp_port = CDP_PORT;
  browserProbe.checked_at = new Date().toISOString();
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
