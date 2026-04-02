import fs from "node:fs";
import path from "node:path";
import { connectBrowser, getOrOpenPage, isDebugPortReady } from "../../../../../browser-automation-core/browser_core";
import { AUTOMATION_LOG_PATH, SESSION_STATE_PATH } from "../project_paths";
import { jsonTimestamp } from "../common/time";

type DownloadedImage = {
  media_name: string;
};

type SessionState = {
  current_project_url?: string;
  current_project_id?: string;
  current_step?: string;
  current_aspect_ratio?: string;
  run_baseline_media_names?: string[];
  current_16x9_rendered?: string[];
  current_16x9_failed?: number[];
  current_1x1_rendered?: string[];
  current_1x1_failed?: number[];
  downloaded_images?: DownloadedImage[];
  last_render_batch?: {
    prompt_ids: number[];
    aspect_ratio: string;
    rendered_media: Array<{ prompt_id: number | null; media_name: string; href: string | null; tile_id: string | null }>;
    failed_prompts?: Array<{ prompt_id: number | null; reason: string; message: string }>;
    captured_at: string;
  };
};

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
  fs.appendFileSync(AUTOMATION_LOG_PATH, `${jsonTimestamp()} ${message}\n`, "utf8");
}

function parseArgs(): { expected: number } {
  const expectedArg = process.argv.find((arg) => arg.startsWith("--expected="));
  const expected = Number.parseInt(expectedArg?.split("=", 2)[1] ?? "0", 10);
  if (!Number.isFinite(expected) || expected <= 0) {
    throw new Error("Usage: --expected=4");
  }
  return { expected };
}

async function countPolicyViolationTiles(page: import("playwright").Page): Promise<number> {
  return page.evaluate(() => {
    const body = document.body.innerText || "";
    const matches = body.match(/This generation might violate our policies/gi);
    return matches ? matches.length : 0;
  });
}

async function countVisibleFailureSignals(page: import("playwright").Page): Promise<number> {
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

async function main(): Promise<void> {
  const { expected } = parseArgs();
  if (!(await isDebugPortReady(9222))) {
    throw new Error("CDP port 9222 is not ready.");
  }

  const session = readJson<SessionState>(SESSION_STATE_PATH, {});
  const known = new Set((session.downloaded_images ?? []).map((item) => item.media_name));
  const baseline = new Set((session.run_baseline_media_names ?? []).filter(Boolean));

  const browser = await connectBrowser(9222);
  try {
    const urlPattern = session.current_project_id ? `/fx/tools/flow/project/${session.current_project_id}` : "/fx/tools/flow";
    const openUrl = session.current_project_url || "https://labs.google/fx/tools/flow";
    const page = await getOrOpenPage(browser, urlPattern, openUrl);

    await page.bringToFront();
    const baselinePolicyViolations = await countPolicyViolationTiles(page);
    const baselineFailureSignals = await countVisibleFailureSignals(page);
    const deadline = Date.now() + (WAIT_TIMEOUT_MINUTES * 60 * 1000);
    let fresh = [] as Array<{ media_name: string; href: string | null; tile_id: string | null }>;
    let policyFailureCount = 0;
    let visibleFailureCount = 0;

    while (Date.now() < deadline) {
      const rendered = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector)).map((img) => {
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
            media_name: mediaName,
            href: anchor?.getAttribute("href") || null,
            tile_id: tile?.getAttribute("data-tile-id") || null,
          };
        }).filter((item) => item.media_name);
      }, GENERATED_IMAGE_SELECTOR) as Array<{ media_name: string; href: string | null; tile_id: string | null }>;

      fresh = rendered
        .filter((item) => !known.has(item.media_name))
        .filter((item) => !baseline.size || !baseline.has(item.media_name))
        .slice(0, expected);
      policyFailureCount = Math.max(0, (await countPolicyViolationTiles(page)) - baselinePolicyViolations);
      visibleFailureCount = Math.max(0, (await countVisibleFailureSignals(page)) - baselineFailureSignals);
      if (fresh.length + Math.max(policyFailureCount, visibleFailureCount) >= expected) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const aspect = session.current_aspect_ratio ?? "1:1";
    const failedField = aspect === "16:9" ? "current_16x9_failed" : "current_1x1_failed";
    policyFailureCount = Math.max(0, (await countPolicyViolationTiles(page)) - baselinePolicyViolations);
    visibleFailureCount = Math.max(0, (await countVisibleFailureSignals(page)) - baselineFailureSignals);
    const classifiedFailureCount = Math.max(policyFailureCount, visibleFailureCount);
    const failedPromptIds = [] as number[];
    const failedPrompts = [] as Array<{ prompt_id: number | null; reason: string; message: string }>;
    const promptIds = session.last_render_batch?.prompt_ids ?? [];
    let failureStartIndex = fresh.length;

    for (const promptId of promptIds.slice(failureStartIndex, failureStartIndex + policyFailureCount)) {
      failedPromptIds.push(promptId);
      failedPrompts.push({
        prompt_id: promptId,
        reason: "policy_violation",
        message: "This generation might violate our policies. Please try a different prompt or send feedback.",
      });
    }
    failureStartIndex += policyFailureCount;

    const genericFailureCount = Math.max(0, classifiedFailureCount - policyFailureCount);
    for (const promptId of promptIds.slice(failureStartIndex, failureStartIndex + genericFailureCount)) {
      failedPromptIds.push(promptId);
      failedPrompts.push({
        prompt_id: promptId,
        reason: "render_failed",
        message: "Flow reported a failed render tile. Retry or reuse prompt is required.",
      });
    }
    failureStartIndex += genericFailureCount;

    if (Date.now() >= deadline && fresh.length + failedPrompts.length < expected) {
      for (const promptId of promptIds.slice(failureStartIndex)) {
        failedPromptIds.push(promptId);
        failedPrompts.push({
          prompt_id: promptId,
          reason: "render_timeout",
          message: `Render did not resolve within ${WAIT_TIMEOUT_MINUTES} minutes and was marked for retry.`,
        });
      }
    }
    if (aspect === "16:9") {
      session.current_16x9_rendered = fresh.map((item) => item.media_name);
    } else {
      session.current_1x1_rendered = fresh.map((item) => item.media_name);
    }
    session[failedField] = failedPromptIds;
    session.last_render_batch = {
      ...(session.last_render_batch ?? { prompt_ids: [], aspect_ratio: aspect, rendered_media: [], captured_at: "" }),
      aspect_ratio: aspect,
      rendered_media: fresh.map((item, index) => ({
        prompt_id: session.last_render_batch?.prompt_ids[index] ?? null,
        media_name: item.media_name,
        href: item.href,
        tile_id: item.tile_id,
      })),
      failed_prompts: failedPrompts,
      captured_at: jsonTimestamp(),
    };
    writeJson(SESSION_STATE_PATH, session);
    appendLog(`Waiter captured ${fresh.length} fresh render(s) for aspect ${aspect}: ${fresh.map((item) => item.media_name).join(", ")}.`);
    if (failedPromptIds.length) {
      appendLog(`Waiter also classified ${failedPromptIds.length} failed render(s) for aspect ${aspect}: ${failedPrompts.map((item) => `${item.prompt_id}:${item.reason}`).join(", ")}.`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  appendLog(`Flow render waiter failed: ${message}`);
  console.error(message);
  process.exit(1);
});
