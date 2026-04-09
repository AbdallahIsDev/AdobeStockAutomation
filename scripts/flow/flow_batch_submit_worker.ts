import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { connectBrowser, getOrOpenPage, isDebugPortReady, waitForElement } from "@bac/browser_core";
import { AUTOMATION_LOG_PATH, DESCRIPTIONS_PATH, SESSION_STATE_PATH } from "../project_paths";
import { jsonTimestamp } from "../common/time";
import { appendAutomationLog } from "../common/logging";

type Description = {
  id: number;
  trend_id: number;
  trend_topic: string;
  series_slot: string;
  aspect_ratio: string;
  prompt_text: string;
  status?: string;
  submitted_at?: string | null;
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
  current_trend_id?: number | null;
  current_series_slot?: string | null;
  images_created_count?: number;
  images_created_16x9_count?: number;
  images_created_1x1_count?: number;
  session_image_cap?: number;
  session_aspect_cap?: number;
  remaining_session_image_capacity?: number;
  remaining_16x9_capacity?: number;
  remaining_1x1_capacity?: number;
  current_16x9_submitted?: number[];
  current_1x1_submitted?: number[];
  current_16x9_rendered?: string[];
  current_16x9_failed?: number[];
  current_1x1_rendered?: string[];
  current_1x1_failed?: number[];
  run_baseline_media_names?: string[];
  active_batches?: Array<{
    batch_id: string;
    prompt_ids: number[];
    aspect_ratio: string;
    expected_count: number;
    rendered_media: Array<{ prompt_id: number | null; media_name: string; href: string | null; tile_id: string | null }>;
    failed_prompts?: Array<{ prompt_id: number | null; reason: string; message: string }>;
    submitted_at?: string;
    captured_at?: string;
    status?: string;
    retry_count?: number;
  }>;
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

const TERMINAL_DESCRIPTION_STATUSES = new Set([
  "submitted",
  "rendered_ready",
  "downloaded",
  "upscale_queued",
  "upscaled",
  "ready_for_metadata_apply",
]);

const PROMPT_SELECTOR = "[role=\"textbox\"][data-slate-editor=\"true\"]";
const GENERATED_IMAGE_SELECTOR = "img[alt=\"Generated image\"]";
const WAIT_TIMEOUT_MINUTES = 6;

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

function normalize(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

// sleep used for polling intervals where no deterministic DOM condition exists.
async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(): { promptIds: number[]; aspectRatio: "16:9" | "1:1"; waitForOutcomes: boolean; retryFailed: boolean } {
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

  return {
    promptIds,
    aspectRatio,
    waitForOutcomes: process.argv.includes("--wait-for-outcomes"),
    retryFailed: process.argv.includes("--retry-failed"),
  };
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

async function waitForBatchOutcomes(
  page: Page,
  promptIds: number[],
  existingMedia: Set<string>,
  baselinePolicyViolations: number,
  baselineFailureSignals: number,
): Promise<{
  newImages: GeneratedImage[];
  failedPromptOutcomes: Array<{ prompt_id: number; reason: string; message: string }>;
}> {
  const deadline = Date.now() + (WAIT_TIMEOUT_MINUTES * 60 * 1000);
  let policyViolationCount = 0;
  let visibleFailureCount = 0;
  while (Date.now() < deadline) {
    const freshImages = sortVisualNewestFirst(await getGeneratedImages(page)).filter((image) => !existingMedia.has(image.mediaName));
    policyViolationCount = Math.max(0, (await countPolicyViolationTiles(page)) - baselinePolicyViolations);
    visibleFailureCount = Math.max(0, (await countVisibleFailureSignals(page)) - baselineFailureSignals);
    const knownFailureCount = Math.max(policyViolationCount, visibleFailureCount);
    if (freshImages.length + knownFailureCount >= promptIds.length) {
      break;
    }
    await sleep(2000);
  }

  const allImages = sortVisualNewestFirst(await getGeneratedImages(page));
  const newImages = allImages.filter((image) => !existingMedia.has(image.mediaName)).slice(0, promptIds.length);
  policyViolationCount = Math.max(0, (await countPolicyViolationTiles(page)) - baselinePolicyViolations);
  visibleFailureCount = Math.max(0, (await countVisibleFailureSignals(page)) - baselineFailureSignals);
  const classifiedFailureCount = Math.max(policyViolationCount, visibleFailureCount);
  const failedPromptOutcomes: Array<{ prompt_id: number; reason: string; message: string }> = [];
  let failureStartIndex = newImages.length;

  for (const promptId of promptIds.slice(failureStartIndex, failureStartIndex + policyViolationCount)) {
    failedPromptOutcomes.push({
      prompt_id: promptId,
      reason: "policy_violation",
      message: "This generation might violate our policies. Please try a different prompt or send feedback.",
    });
  }
  failureStartIndex += policyViolationCount;

  const genericFailureCount = Math.max(0, classifiedFailureCount - policyViolationCount);
  for (const promptId of promptIds.slice(failureStartIndex, failureStartIndex + genericFailureCount)) {
    failedPromptOutcomes.push({
      prompt_id: promptId,
      reason: "render_failed",
      message: "Flow reported a failed render tile. Retry or reuse prompt is required.",
    });
  }
  failureStartIndex += genericFailureCount;

  if (Date.now() >= deadline && newImages.length + failedPromptOutcomes.length < promptIds.length) {
    for (const promptId of promptIds.slice(failureStartIndex)) {
      failedPromptOutcomes.push({
        prompt_id: promptId,
        reason: "render_timeout",
        message: `Render did not resolve within ${WAIT_TIMEOUT_MINUTES} minutes and was marked for retry.`,
      });
    }
  }

  return { newImages, failedPromptOutcomes };
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

async function countVisibleFailureSignals(page: Page): Promise<number> {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("button,[role=\"button\"]")) as HTMLElement[];
    let retryCount = 0;
    let reusePromptCount = 0;
    for (const el of buttons) {
      const text = `${el.textContent || ""} ${el.getAttribute("aria-label") || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
      const rect = el.getBoundingClientRect();
      if (rect.width > 90 || rect.height > 70) {
        continue;
      }
      if (text.includes("retry")) {
        retryCount += 1;
      }
      if (text.includes("reuse prompt")) {
        reusePromptCount += 1;
      }
    }
    return Math.max(retryCount, reusePromptCount);
  });
}

async function fillPrompt(page: Page, prompt: string): Promise<void> {
  const textbox = page.locator(PROMPT_SELECTOR).first();
  await waitForElement(page, PROMPT_SELECTOR, 5000);

  const waitForPromptEcho = async (timeout: number): Promise<boolean> => {
    try {
      await page.waitForFunction(
        ({ selector, expected }) => {
          const element = document.querySelector(selector) as HTMLElement | null;
          if (!element) return false;
          const text = (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim();
          return text.includes(expected.slice(0, 32));
        },
        { selector: PROMPT_SELECTOR, expected: prompt },
        { timeout },
      );
      return true;
    } catch {
      return false;
    }
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await textbox.click({ timeout: 5000 });
    await page.keyboard.press("Control+a").catch(() => undefined);
    await page.keyboard.press("Backspace").catch(() => undefined);
    await page.keyboard.insertText(prompt);
    if (await waitForPromptEcho(8000)) {
      return;
    }

    await textbox.evaluate((element, value) => {
      const editable = element as HTMLElement;
      editable.focus();
      editable.textContent = value;
      editable.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        composed: true,
        data: value,
        inputType: "insertText",
      }));
    }, prompt).catch(() => undefined);

    if (await waitForPromptEcho(5000)) {
      return;
    }
  }

  throw new Error(`Prompt textbox did not reflect the submitted prompt text for: ${prompt.slice(0, 64)}`);
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
  const { promptIds, aspectRatio, waitForOutcomes, retryFailed } = parseArgs();
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
  const promptsToSubmit = prompts.filter((prompt) => !TERMINAL_DESCRIPTION_STATUSES.has(prompt.status ?? ""));

  const session = readJson<SessionState>(SESSION_STATE_PATH, {});
  const sessionImageCap = session.session_image_cap ?? 64;
  const sessionAspectCap = session.session_aspect_cap ?? 32;
  const newWidePrompts = promptsToSubmit.filter((prompt) => prompt.aspect_ratio === "16:9");
  const newSquarePrompts = promptsToSubmit.filter((prompt) => prompt.aspect_ratio === "1:1");

  for (const prompt of prompts) {
    if (prompt.status === "deferred_next_session") {
      throw new Error(`Prompt ${prompt.id} is deferred to the next session and cannot be submitted in the current 64-image run.`);
    }
  }

  if (!promptsToSubmit.length) {
    appendLog(`Skipping submit for prompt ids ${promptIds.join(", ")} because they are already in a terminal submitted/downloaded state.`);
    return;
  }

  const projectedTotal = (session.images_created_count ?? 0) + newWidePrompts.length + newSquarePrompts.length;
  const projectedWide = (session.images_created_16x9_count ?? 0) + newWidePrompts.length;
  const projectedSquare = (session.images_created_1x1_count ?? 0) + newSquarePrompts.length;

  if (projectedTotal > sessionImageCap) {
    throw new Error(`Session image cap exceeded. Current=${session.images_created_count ?? 0}, requested=${newWidePrompts.length + newSquarePrompts.length}, cap=${sessionImageCap}. Start a new session to get another 64-image budget.`);
  }
  if (projectedWide > sessionAspectCap) {
    throw new Error(`16:9 session cap exceeded. Current=${session.images_created_16x9_count ?? 0}, requested=${newWidePrompts.length}, cap=${sessionAspectCap}.`);
  }
  if (projectedSquare > sessionAspectCap) {
    throw new Error(`1:1 session cap exceeded. Current=${session.images_created_1x1_count ?? 0}, requested=${newSquarePrompts.length}, cap=${sessionAspectCap}.`);
  }

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
    const baselineFailureSignals = await countVisibleFailureSignals(page);
    if (!Array.isArray(session.run_baseline_media_names) || !session.run_baseline_media_names.length) {
      session.run_baseline_media_names = [...existingMedia];
    }
    const submittedAt = jsonTimestamp();
    const batchId = `${submittedAt}__${aspectRatio}__${promptsToSubmit[0]?.id ?? promptIds[0]}-${promptsToSubmit[promptsToSubmit.length - 1]?.id ?? promptIds[promptIds.length - 1]}`;

    for (const prompt of promptsToSubmit) {
      await dismissToast(page);
      await fillPrompt(page, prompt.prompt_text);
      await clickCreate(page);
      await waitForPromptReset(page, prompt.prompt_text);
      appendLog(`Prompt ${prompt.id} submitted for ${prompt.series_slot} (${aspectRatio}).`);
    }

    const submittedField = aspectRatio === "16:9" ? "current_16x9_submitted" : "current_1x1_submitted";
    const failedField = aspectRatio === "16:9" ? "current_16x9_failed" : "current_1x1_failed";
    session[submittedField] = promptsToSubmit.map((prompt) => prompt.id);
    session[failedField] = [];
    session.current_aspect_ratio = aspectRatio;
    session.current_step = "STEP_RENDERING_IN_PROGRESS";
    session.images_created_count = projectedTotal;
    session.images_created_16x9_count = projectedWide;
    session.images_created_1x1_count = projectedSquare;
    session.remaining_session_image_capacity = sessionImageCap - projectedTotal;
    session.remaining_16x9_capacity = sessionAspectCap - projectedWide;
    session.remaining_1x1_capacity = sessionAspectCap - projectedSquare;
    session.current_description_index = promptsToSubmit[0]?.id ?? session.current_description_index ?? null;
    session.current_trend_id = promptsToSubmit[0]?.trend_id ?? session.current_trend_id ?? null;
    session.current_series_slot = promptsToSubmit[0]?.series_slot ?? session.current_series_slot ?? null;
    for (const prompt of promptsToSubmit) {
      prompt.status = "submitted";
      prompt.submitted_at = submittedAt;
    }
    const activeBatches = Array.isArray(session.active_batches) ? session.active_batches : [];
    const batchRecord = {
      batch_id: batchId,
      prompt_ids: promptsToSubmit.map((prompt) => prompt.id),
      aspect_ratio: aspectRatio,
      expected_count: promptsToSubmit.length,
      rendered_media: [],
      failed_prompts: [],
      submitted_at: submittedAt,
      captured_at: submittedAt,
      status: "submitted",
      retry_count: 0,
    };
    activeBatches.push(batchRecord);
    session.active_batches = activeBatches;
    session.last_render_batch = {
      prompt_ids: promptsToSubmit.map((prompt) => prompt.id),
      aspect_ratio: aspectRatio,
      rendered_media: [],
      failed_prompts: [],
      submitted_at: submittedAt,
      captured_at: submittedAt,
    };
    writeJson(DESCRIPTIONS_PATH, descriptionsPayload);
    writeJson(SESSION_STATE_PATH, session);

    appendLog(`Streaming batch armed for prompt ids ${promptsToSubmit.map((prompt) => prompt.id).join(", ")} at ${aspectRatio}. Session remaining=${session.remaining_session_image_capacity}, wide_remaining=${session.remaining_16x9_capacity}, square_remaining=${session.remaining_1x1_capacity}. Downloads may start as soon as individual renders appear.`);
    if (!waitForOutcomes) {
      return;
    }
    const activePromptIds = promptsToSubmit.map((prompt) => prompt.id);
    const firstPass = await waitForBatchOutcomes(page, activePromptIds, existingMedia, baselinePolicyViolations, baselineFailureSignals);
    let newImages = firstPass.newImages;
    let failedPrompts = firstPass.failedPromptOutcomes;

    if (retryFailed && failedPrompts.length) {
      const failedPromptIds = failedPrompts.map((item) => item.prompt_id);
      appendLog(`Retrying failed prompt ids ${failedPromptIds.join(", ")} at ${aspectRatio}.`);
      const retryDescriptions = failedPromptIds
        .map((id) => descriptionsById.get(id))
        .filter((item): item is Description => Boolean(item));
      const retryBaselineMedia = new Set((await getGeneratedImages(page)).map((image) => image.mediaName));
      const retryBaselinePolicyViolations = await countPolicyViolationTiles(page);
      const retryBaselineFailureSignals = await countVisibleFailureSignals(page);
      for (const prompt of retryDescriptions) {
        await dismissToast(page);
        await fillPrompt(page, prompt.prompt_text);
        await clickCreate(page);
        await waitForPromptReset(page, prompt.prompt_text);
        appendLog(`Retry prompt ${prompt.id} submitted for ${prompt.series_slot} (${aspectRatio}).`);
      }
      const retryPass = await waitForBatchOutcomes(page, failedPromptIds, retryBaselineMedia, retryBaselinePolicyViolations, retryBaselineFailureSignals);
      newImages = [...newImages, ...retryPass.newImages].slice(0, activePromptIds.length);
      failedPrompts = retryPass.failedPromptOutcomes;
    }

    const renderedField = aspectRatio === "16:9" ? "current_16x9_rendered" : "current_1x1_rendered";
    session[renderedField] = newImages.map((image) => image.mediaName);
    session[failedField] = failedPrompts.map((item) => item.prompt_id);
    session.current_step = "STEP_RENDERED_READY_FOR_DOWNLOAD";
    session.last_render_batch = {
      prompt_ids: activePromptIds,
      aspect_ratio: aspectRatio,
      rendered_media: newImages.map((image, index) => ({
        prompt_id: activePromptIds[index] ?? null,
        media_name: image.mediaName,
        href: image.href,
        tile_id: image.tileId,
      })),
      failed_prompts: failedPrompts,
      submitted_at: session.last_render_batch?.submitted_at ?? submittedAt,
      captured_at: jsonTimestamp(),
    };
    const batchToUpdate = (session.active_batches ?? []).find((item) => item.batch_id === batchId);
    if (batchToUpdate) {
      batchToUpdate.rendered_media = session.last_render_batch.rendered_media;
      batchToUpdate.failed_prompts = failedPrompts;
      batchToUpdate.captured_at = session.last_render_batch.captured_at;
      batchToUpdate.status = failedPrompts.length ? "partial_failure" : "rendered_ready";
      batchToUpdate.retry_count = retryFailed ? 1 : 0;
    }
    writeJson(SESSION_STATE_PATH, session);

    if (failedPrompts.length) {
      appendLog(`Failed outcomes detected for prompt ids ${failedPrompts.map((item) => `${item.prompt_id}:${item.reason}`).join(", ")} at ${aspectRatio}. Successful siblings remain valid for immediate download.`);
    }
    appendLog(`Rendered ${newImages.length} image(s) for prompt ids ${activePromptIds.join(", ")} at ${aspectRatio}. Media: ${newImages.map((item) => item.mediaName).join(", ")}.`);
  } finally {
    void browser;
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  appendLog(`Flow batch submit worker failed: ${message}`);
  console.error(message);
  process.exit(1);
});
