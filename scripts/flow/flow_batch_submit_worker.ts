import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { connectBrowser, getOrOpenPage, isDebugPortReady, waitForElement } from "../../../../../browser-automation-core/browser_core";
import { AUTOMATION_LOG_PATH, DESCRIPTIONS_PATH, SESSION_STATE_PATH } from "../project_paths";
import { jsonTimestamp } from "../common/time";

type Description = {
  id: number;
  trend_id: number;
  trend_topic: string;
  series_slot: string;
  aspect_ratio: string;
  prompt_text: string;
};

type DownloadedImage = {
  media_name: string;
  href?: string | null;
  tile_id?: string | null;
};

type GeneratedImage = {
  index: number;
  mediaName: string;
  tileId: string | null;
  href: string | null;
  top: number;
  left: number;
};

type SessionState = {
  current_project_url?: string;
  current_project_id?: string;
  current_aspect_ratio?: string;
  current_step?: string;
  current_description_index?: number;
  current_16x9_submitted?: number[];
  current_1x1_submitted?: number[];
  current_16x9_rendered?: string[];
  current_16x9_failed?: number[];
  current_1x1_rendered?: string[];
  current_1x1_failed?: number[];
  downloaded_images?: DownloadedImage[];
  errors?: string[];
  last_render_batch?: {
    prompt_ids: number[];
    aspect_ratio: string;
    rendered_media: Array<{ prompt_id: number | null; media_name: string; href: string | null; tile_id: string | null }>;
    failed_prompts?: Array<{ prompt_id: number | null; reason: string; message: string }>;
    submitted_at?: string;
    captured_at: string;
  };
};

const PROMPT_SELECTOR = "[role=\"textbox\"][data-slate-editor=\"true\"]";
const GENERATED_IMAGE_SELECTOR = "img[alt=\"Generated image\"]";

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
  fs.appendFileSync(AUTOMATION_LOG_PATH, `${jsonTimestamp()} ${message}\n`, "utf8");
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(): { promptIds: number[]; aspectRatio: "16:9" | "1:1"; waitForOutcomes: boolean } {
  const promptIdsArg = process.argv.find((arg) => arg.startsWith("--prompt-ids="));
  const aspectArg = process.argv.find((arg) => arg.startsWith("--aspect="));
  if (!promptIdsArg || !aspectArg) {
    throw new Error("Usage: --prompt-ids=17,18,19,20 --aspect=16:9|1:1 [--wait-for-outcomes]");
  }

  const promptIds = promptIdsArg
    .split("=", 2)[1]
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value));

  const aspectRatio = aspectArg.split("=", 2)[1] as "16:9" | "1:1";
  if (!promptIds.length || !["16:9", "1:1"].includes(aspectRatio)) {
    throw new Error("Invalid prompt ids or aspect ratio.");
  }

  return { promptIds, aspectRatio, waitForOutcomes: process.argv.includes("--wait-for-outcomes") };
}

async function dismissToast(page: Page): Promise<void> {
  const dismissButton = page.locator("button").filter({ hasText: "Dismiss" }).first();
  const count = await dismissButton.count().catch(() => 0);
  if (!count) {
    return;
  }

  await dismissButton.click({ timeout: 2000 }).catch(() => undefined);
  await page.waitForFunction(
    () => !document.body.innerText.includes("Upscaling complete, your image has been downloaded!"),
    undefined,
    { timeout: 2000 },
  ).catch(() => undefined);
}

async function currentSettingsLabel(page: Page): Promise<string> {
  return normalize(await page.locator("button").filter({ hasText: "Nano Banana 2" }).first().innerText({ timeout: 3000 }).catch(() => ""));
}

async function isSettingsOpen(page: Page): Promise<boolean> {
  return page.evaluate(() => document.querySelectorAll("[role=\"tab\"]").length > 0);
}

async function openSettings(page: Page): Promise<void> {
  if (await isSettingsOpen(page)) {
    return;
  }
  const button = page.locator("button").filter({ hasText: "Nano Banana 2" }).first();
  await button.click({ timeout: 3000 });
  await page.waitForFunction(
    () => document.querySelectorAll("[role=\"tab\"]").length > 0,
    undefined,
    { timeout: 3000 },
  );
}

async function closeSettings(page: Page): Promise<void> {
  if (!(await isSettingsOpen(page))) {
    return;
  }
  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForFunction(
    () => document.querySelectorAll("[role=\"tab\"]").length === 0,
    undefined,
    { timeout: 3000 },
  ).catch(() => undefined);
}

async function ensureAspectRatio(page: Page, aspectRatio: "16:9" | "1:1"): Promise<void> {
  const expectedLabel = aspectRatio === "16:9" ? "crop_16_9" : "crop_square";
  if ((await currentSettingsLabel(page)).includes(expectedLabel)) {
    await closeSettings(page);
    return;
  }

  await openSettings(page);
  const tabText = aspectRatio === "16:9" ? "16:9" : "1:1";
  await page.locator("[role=\"tab\"]").filter({ hasText: tabText }).first().click({ timeout: 3000 });
  await page.waitForFunction(
    (label) => {
      const activeTab = Array.from(document.querySelectorAll("[role=\"tab\"][aria-selected=\"true\"]"))
        .find((node) => (node.textContent || "").includes(label));
      return Boolean(activeTab);
    },
    tabText,
    { timeout: 3000 },
  );

  await closeSettings(page);
  await page.waitForFunction(
    (expected) => {
      const button = Array.from(document.querySelectorAll("button"))
        .find((node) => (node.textContent || "").includes("Nano Banana 2"));
      return (button?.textContent || "").includes(expected);
    },
    expectedLabel,
    { timeout: 3000 },
  );
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

function sortVisualNewestFirst(images: GeneratedImage[]): GeneratedImage[] {
  return [...images].sort((a, b) => {
    if (a.top !== b.top) {
      return a.top - b.top;
    }
    if (a.left !== b.left) {
      return a.left - b.left;
    }
    return a.index - b.index;
  });
}

async function countPolicyViolationTiles(page: Page): Promise<number> {
  return page.evaluate(() => {
    const body = document.body.innerText || "";
    const matches = body.match(/This generation might violate our policies/gi);
    return matches ? matches.length : 0;
  });
}

async function fillPrompt(page: Page, prompt: string): Promise<void> {
  const textbox = page.locator(PROMPT_SELECTOR).first();
  await textbox.click({ timeout: 3000 });
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Backspace");
  await page.keyboard.type(prompt, { delay: 0 });
  await page.waitForFunction(
    ({ selector, expected }) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      if (!element) return false;
      return (element.innerText || "").includes(expected.slice(0, 32));
    },
    { selector: PROMPT_SELECTOR, expected: prompt },
    { timeout: 3000 },
  );
}

async function clickCreate(page: Page): Promise<void> {
  const exact = page.locator("button").filter({ hasText: "arrow_forward Create" }).first();
  if (await exact.count().catch(() => 0)) {
    await exact.click({ timeout: 3000 });
    return;
  }

  const genericCreate = page.locator("button").filter({ hasText: "Create" }).last();
  await genericCreate.click({ timeout: 3000 });
}

async function waitForPromptReset(page: Page, prompt: string): Promise<void> {
  await page.waitForFunction(
    ({ selector, promptStart }) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      if (!element) return false;
      const text = (element.innerText || "").trim();
      return !text || text === "What do you want to create?" || !text.includes(promptStart);
    },
    { selector: PROMPT_SELECTOR, promptStart: prompt.slice(0, 32) },
    { timeout: 10000 },
  );
}

async function main(): Promise<void> {
  const { promptIds, aspectRatio, waitForOutcomes } = parseArgs();
  if (!(await isDebugPortReady(9222))) {
    throw new Error("CDP port 9222 is not ready.");
  }

  const descriptionsPayload = readJson<{ descriptions: Description[] }>(DESCRIPTIONS_PATH, { descriptions: [] });
  const descriptionsById = new Map(descriptionsPayload.descriptions.map((item) => [item.id, item]));
  const prompts = promptIds.map((id) => {
    const description = descriptionsById.get(id);
    if (!description) {
      throw new Error(`Description ${id} not found.`);
    }
    return description;
  });

  const session = readJson<SessionState>(SESSION_STATE_PATH, {});
  const browser = await connectBrowser(9222);
  try {
    const urlPattern = session.current_project_id ? `/fx/tools/flow/project/${session.current_project_id}` : "/fx/tools/flow";
    const openUrl = session.current_project_url || "https://labs.google/fx/tools/flow";
    const page = await getOrOpenPage(browser, urlPattern, openUrl);

    await page.bringToFront();
    await dismissToast(page);
    if (!(await waitForElement(page, PROMPT_SELECTOR, 5000))) {
      throw new Error("Flow prompt textbox not found.");
    }

    await ensureAspectRatio(page, aspectRatio);

    const existingImages = sortVisualNewestFirst(await getGeneratedImages(page));
    const existingMedia = new Set(existingImages.map((image) => image.mediaName));
    const baselinePolicyViolations = await countPolicyViolationTiles(page);

    for (const prompt of prompts) {
      await dismissToast(page);
      await fillPrompt(page, prompt.prompt_text);
      await clickCreate(page);
      await waitForPromptReset(page, prompt.prompt_text);
      appendLog(`Prompt ${prompt.id} submitted for ${prompt.series_slot} (${aspectRatio}).`);
    }

    const submittedField = aspectRatio === "16:9" ? "current_16x9_submitted" : "current_1x1_submitted";
    const failedField = aspectRatio === "16:9" ? "current_16x9_failed" : "current_1x1_failed";
    session[submittedField] = promptIds;
    session[failedField] = [];
    session.current_aspect_ratio = aspectRatio;
    session.current_step = "STEP_RENDERING_IN_PROGRESS";
    session.last_render_batch = {
      prompt_ids: promptIds,
      aspect_ratio: aspectRatio,
      rendered_media: [],
      failed_prompts: [],
      submitted_at: jsonTimestamp(),
      captured_at: jsonTimestamp(),
    };
    writeJson(SESSION_STATE_PATH, session);

    appendLog(`Streaming batch armed for prompt ids ${promptIds.join(", ")} at ${aspectRatio}. Downloads may start as soon as individual renders appear.`);
    if (!waitForOutcomes) {
      return;
    }

    const deadline = Date.now() + (20 * 60 * 1000);
    let policyViolationCount = 0;
    while (Date.now() < deadline) {
      const freshImages = sortVisualNewestFirst(await getGeneratedImages(page)).filter((image) => !existingMedia.has(image.mediaName));
      policyViolationCount = Math.max(0, (await countPolicyViolationTiles(page)) - baselinePolicyViolations);
      if (freshImages.length + policyViolationCount >= promptIds.length) {
        break;
      }
      await sleep(2000);
    }

    const allImages = sortVisualNewestFirst(await getGeneratedImages(page));
    const newImages = allImages.filter((image) => !existingMedia.has(image.mediaName)).slice(0, promptIds.length);
    const failedPromptIds = promptIds.slice(newImages.length, newImages.length + policyViolationCount);

    const renderedField = aspectRatio === "16:9" ? "current_16x9_rendered" : "current_1x1_rendered";
    session[renderedField] = newImages.map((image) => image.mediaName);
    session[failedField] = failedPromptIds;
    session.current_step = "STEP_RENDERED_READY_FOR_DOWNLOAD";
    session.last_render_batch = {
      prompt_ids: promptIds,
      aspect_ratio: aspectRatio,
      rendered_media: newImages.map((image, index) => ({
        prompt_id: promptIds[index] ?? null,
        media_name: image.mediaName,
        href: image.href,
        tile_id: image.tileId,
      })),
      failed_prompts: failedPromptIds.map((promptId) => ({
        prompt_id: promptId,
        reason: "policy_violation",
        message: "This generation might violate our policies. Please try a different prompt or send feedback.",
      })),
      submitted_at: session.last_render_batch?.submitted_at ?? jsonTimestamp(),
      captured_at: jsonTimestamp(),
    };
    writeJson(SESSION_STATE_PATH, session);

    if (failedPromptIds.length) {
      appendLog(`Prompt-violation outcomes detected for prompt ids ${failedPromptIds.join(", ")} at ${aspectRatio}. Successful siblings remain valid for immediate download.`);
    }
    appendLog(`Rendered ${newImages.length} image(s) for prompt ids ${promptIds.join(", ")} at ${aspectRatio}. Media: ${newImages.map((item) => item.mediaName).join(", ")}.`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  appendLog(`Flow batch submit worker failed: ${message}`);
  console.error(message);
  process.exit(1);
});
