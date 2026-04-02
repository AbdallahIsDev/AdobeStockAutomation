import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { DESCRIPTIONS_PATH, ROOT, SESSION_STATE_PATH } from "../project_paths";
import { appendAutomationLog } from "../common/logging";

type Description = {
  id: number;
  trend_id: number;
  trend_topic?: string;
  loop_index?: number;
  aspect_ratio: "16:9" | "1:1";
  quantity?: number;
  prompt_text?: string;
  commercial_tags?: string[];
  series_slot?: string;
  prompt_batch_type: "wide" | "square";
  status?: string;
  deferred_until_next_session?: boolean;
  submitted_at?: string;
};

type DescriptionsFile = {
  descriptions?: Description[];
  total_descriptions?: number;
  session_active_descriptions?: number;
  loop_index?: number;
};

type FailedPrompt = {
  prompt_id?: number | null;
};

type BatchRecord = {
  prompt_ids?: number[];
  aspect_ratio?: "16:9" | "1:1";
  expected_count?: number;
  rendered_media?: Array<{
    prompt_id?: number | null;
    media_name?: string;
    href?: string | null;
    tile_id?: string | null;
  }>;
  failed_prompts?: FailedPrompt[];
  status?: string;
};

type SessionState = {
  images_created_count?: number;
  images_downloaded_count?: number;
  session_image_cap?: number;
  current_step?: string;
  current_aspect_ratio?: "16:9" | "1:1";
  downloaded_images?: Array<{ prompt_id?: number | null; media_name?: string }>;
  last_render_batch?: BatchRecord;
  active_batches?: BatchRecord[];
  current_16x9_failed?: number[];
  current_1x1_failed?: number[];
};

const WAIT_TIMEOUT_MINUTES = 20;
const RUN_SESSION_LOCK_PATH = path.join(ROOT, "data", "flow_run_session.lock.json");
const RUN_SESSION_STALE_MS = 90 * 60 * 1000;

type RunSessionLock = {
  pid: number;
  started_at: string;
};

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendLog(message: string): void {
  appendAutomationLog(message);
}

function acquireRunSessionLock(): void {
  fs.mkdirSync(path.dirname(RUN_SESSION_LOCK_PATH), { recursive: true });
  const payload: RunSessionLock = {
    pid: process.pid,
    started_at: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(RUN_SESSION_LOCK_PATH, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== "EEXIST") {
      throw error;
    }
  }

  try {
    const stats = fs.statSync(RUN_SESSION_LOCK_PATH);
    if ((Date.now() - stats.mtimeMs) > RUN_SESSION_STALE_MS) {
      fs.rmSync(RUN_SESSION_LOCK_PATH, { force: true });
      fs.writeFileSync(RUN_SESSION_LOCK_PATH, `${JSON.stringify(payload, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
      appendLog("run-session removed a stale controller lock and resumed.");
      return;
    }

    const existing = readJson<Partial<RunSessionLock>>(RUN_SESSION_LOCK_PATH, {});
    throw new Error(
      `run-session is already active (pid=${existing.pid ?? "unknown"}, started_at=${existing.started_at ?? "unknown"}).`,
    );
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("run-session is already active and the lock could not be acquired.");
  }
}

function releaseRunSessionLock(): void {
  try {
    fs.rmSync(RUN_SESSION_LOCK_PATH, { force: true });
  } catch {
    // best effort only
  }
}

function parseArgs(): { maxCycles: number | null } {
  const maxCyclesArg = process.argv.find((arg) => arg.startsWith("--max-cycles="));
  if (!maxCyclesArg) {
    return { maxCycles: null };
  }

  const parsed = Number.parseInt(maxCyclesArg.split("=", 2)[1] ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("Usage: --max-cycles=1 (positive integer)");
  }

  return { maxCycles: parsed };
}

function runTsWorker(workerPath: string, args: string[]): void {
  const result = spawnSync(
    "npx",
    ["--yes", "tsx", workerPath, ...args],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "inherit",
      shell: true,
    },
  );

  if (result.status !== 0) {
    throw new Error(`Worker failed: ${path.basename(workerPath)} ${args.join(" ")} (exit ${result.status ?? -1}).`);
  }
}

function readSession(): SessionState {
  return readJson<SessionState>(SESSION_STATE_PATH, {});
}

function readDescriptions(): DescriptionsFile {
  return readJson<DescriptionsFile>(DESCRIPTIONS_PATH, { descriptions: [] });
}

function loopVariationSuffix(loopIndex: number, aspect: "16:9" | "1:1"): string {
  if (loopIndex <= 1) {
    return "";
  }
  return aspect === "16:9"
    ? `, loop ${loopIndex} variation with a different wide commercial composition and alternate buyer-facing framing`
    : `, loop ${loopIndex} variation with a different square commercial composition and alternate buyer-facing framing`;
}

function extendPromptInventoryIfNeeded(session: SessionState): boolean {
  const descriptionsFile = readDescriptions();
  const descriptions = descriptionsFile.descriptions ?? [];
  const sessionCap = session.session_image_cap ?? 64;
  const activeDescriptions = descriptions.filter((item) => !item.deferred_until_next_session);
  const readyDescriptions = activeDescriptions.filter((item) => item.status === "ready");
  if (readyDescriptions.length > 0 || activeDescriptions.length >= sessionCap || !activeDescriptions.length) {
    return false;
  }

  const baseCycle = activeDescriptions.slice(0, Math.min(activeDescriptions.length, sessionCap));
  const maxLoopIndex = Math.max(1, ...baseCycle.map((item) => item.loop_index ?? 1));
  let nextId = Math.max(0, ...descriptions.map((item) => item.id)) + 1;
  let extensionCount = 0;

  while ((activeDescriptions.length + extensionCount) < sessionCap) {
    const template = baseCycle[extensionCount % baseCycle.length];
    const cloneLoopIndex = maxLoopIndex + Math.floor(extensionCount / baseCycle.length) + 1;
    descriptions.push({
      ...template,
      id: nextId,
      loop_index: cloneLoopIndex,
      prompt_text: `${template.prompt_text ?? ""}${loopVariationSuffix(cloneLoopIndex, template.aspect_ratio)}`.trim(),
      status: "ready",
      deferred_until_next_session: false,
      submitted_at: undefined,
    });
    nextId += 1;
    extensionCount += 1;
  }

  descriptionsFile.descriptions = descriptions;
  descriptionsFile.total_descriptions = descriptions.length;
  descriptionsFile.session_active_descriptions = descriptions.filter((item) => !item.deferred_until_next_session).length;
  descriptionsFile.loop_index = Math.max(maxLoopIndex + 1, descriptionsFile.loop_index ?? 1);
  writeJson(DESCRIPTIONS_PATH, descriptionsFile);
  appendLog(`run-session extended prompt inventory by ${extensionCount} prompts to reach the session cap of ${sessionCap}.`);
  return extensionCount > 0;
}

function hasOutstandingFailures(session: SessionState): boolean {
  return (session.current_16x9_failed?.length ?? 0) > 0
    || (session.current_1x1_failed?.length ?? 0) > 0
    || (session.last_render_batch?.failed_prompts?.some((item) => typeof item.prompt_id === "number") ?? false)
    || (session.active_batches ?? []).some((batch) => (batch.failed_prompts ?? []).some((item) => typeof item.prompt_id === "number"));
}

function needsRenderCapture(session: SessionState): number | null {
  const batch = session.last_render_batch;
  if (!batch?.prompt_ids?.length) {
    return null;
  }
  const downloadedPromptIds = new Set(
    (session.downloaded_images ?? [])
      .map((item) => item.prompt_id)
      .filter((value): value is number => typeof value === "number"),
  );
  const renderedCount = batch.rendered_media?.length ?? 0;
  const failedCount = batch.failed_prompts?.length ?? 0;
  const downloadedCount = (batch.prompt_ids ?? []).filter((promptId) => downloadedPromptIds.has(promptId)).length;
  const expectedCount = batch.expected_count ?? batch.prompt_ids.length;
  if (renderedCount + failedCount >= expectedCount || downloadedCount >= expectedCount) {
    return null;
  }
  return expectedCount;
}

function markSessionStep(step: string): void {
  const session = readSession();
  session.current_step = step;
  writeJson(SESSION_STATE_PATH, session);
}

function pickNextBatch(descriptions: Description[], aspect: "16:9" | "1:1"): number[] {
  const promptBatchType = aspect === "16:9" ? "wide" : "square";
  const ready = descriptions
    .filter((item) => item.aspect_ratio === aspect)
    .filter((item) => item.prompt_batch_type === promptBatchType)
    .filter((item) => !item.deferred_until_next_session)
    .filter((item) => item.status === "ready")
    .sort((a, b) => a.id - b.id);

  if (!ready.length) {
    return [];
  }

  const first = ready[0];
  const batch = ready
    .filter((item) => item.trend_id === first.trend_id)
    .filter((item) => item.prompt_batch_type === first.prompt_batch_type)
    .slice(0, 4);

  if (batch.length !== 4) {
    appendLog(`run-session recovery is submitting a partial ${aspect} batch for trend ${first.trend_id}: ${batch.map((item) => item.id).join(", ")}.`);
  }

  return batch.map((item) => item.id);
}

function sessionCapReached(session: SessionState): boolean {
  const created = session.images_created_count ?? 0;
  const cap = session.session_image_cap ?? 64;
  return created >= cap;
}

function downloadReadyImagesIfAny(): boolean {
  const before = readSession().images_downloaded_count ?? 0;
  appendLog("run-session harvesting any ready renders across active batches.");
  runTsWorker(path.join(ROOT, "scripts", "flow", "flow_nonblocking_download_worker.ts"), []);
  const after = readSession().images_downloaded_count ?? 0;
  return after > before;
}

function retryAndRecoverIfNeeded(): boolean {
  let didWork = false;
  let session = readSession();

  if (hasOutstandingFailures(session)) {
    appendLog("run-session detected failed prompts and is invoking retry-failed.");
    runTsWorker(path.join(ROOT, "scripts", "flow", "flow_retry_failed_prompts.ts"), []);
    didWork = true;
    runTsWorker(path.join(ROOT, "scripts", "flow", "flow_nonblocking_download_worker.ts"), []);
    session = readSession();
  }

  if (hasOutstandingFailures(session)) {
    appendLog("run-session detected remaining failures after retry and is invoking recover-failures.");
    runTsWorker(path.join(ROOT, "scripts", "flow", "flow_recover_failures.ts"), []);
    didWork = true;

    const expected = needsRenderCapture(readSession());
    if (expected) {
      runTsWorker(path.join(ROOT, "scripts", "flow", "flow_wait_for_new_renders.ts"), [`--expected=${expected}`]);
    }
    runTsWorker(path.join(ROOT, "scripts", "flow", "flow_nonblocking_download_worker.ts"), []);
  }

  return didWork;
}

function capturePendingRendersIfNeeded(): boolean {
  const expected = needsRenderCapture(readSession());
  if (!expected) {
    return false;
  }

  appendLog(`run-session is waiting for current batch renders (expected=${expected}, timeout=${WAIT_TIMEOUT_MINUTES}m max worker wait).`);
  runTsWorker(path.join(ROOT, "scripts", "flow", "flow_wait_for_new_renders.ts"), [`--expected=${expected}`]);
  runTsWorker(path.join(ROOT, "scripts", "flow", "flow_nonblocking_download_worker.ts"), []);
  return true;
}

function hasTrackedBatch(promptIds: number[], aspect: "16:9" | "1:1"): boolean {
  if (!promptIds.length) {
    return false;
  }

  return (readSession().active_batches ?? []).some((batch) => {
    const batchPromptIds = batch.prompt_ids ?? [];
    return batch.aspect_ratio === aspect
      && batchPromptIds.length === promptIds.length
      && batchPromptIds.every((promptId, index) => promptId === promptIds[index]);
  });
}

function submitBatch(promptIds: number[], aspect: "16:9" | "1:1"): boolean {
  if (!promptIds.length) {
    return false;
  }

  if (hasTrackedBatch(promptIds, aspect)) {
    appendLog(`run-session skipped duplicate ${aspect} batch already tracked: ${promptIds.join(", ")}`);
    return false;
  }

  appendLog(`run-session submitting ${aspect} batch: ${promptIds.join(", ")}`);
  runTsWorker(
    path.join(ROOT, "scripts", "flow", "flow_batch_submit_worker.ts"),
    [`--prompt-ids=${promptIds.join(",")}`, `--aspect=${aspect}`, "--wait-for-outcomes", "--retry-failed"],
  );
  runTsWorker(path.join(ROOT, "scripts", "flow", "flow_nonblocking_download_worker.ts"), []);
  retryAndRecoverIfNeeded();
  return true;
}

function main(): void {
  acquireRunSessionLock();
  const { maxCycles } = parseArgs();
  appendLog("run-session started for File 02 image creation controller.");

  try {
    let cycles = 0;
    while (true) {
      cycles += 1;
      if (maxCycles !== null && cycles > maxCycles) {
        appendLog(`run-session stopped after reaching max test cycles (${maxCycles}).`);
        break;
      }

      const descriptionsBefore = readDescriptions().descriptions ?? [];

      let didWork = false;

      if (downloadReadyImagesIfAny()) {
        didWork = true;
      }

      if (capturePendingRendersIfNeeded()) {
        didWork = true;
      }

      if (retryAndRecoverIfNeeded()) {
        didWork = true;
      }

      const sessionCurrent = readSession();
      if (sessionCapReached(sessionCurrent)) {
        appendLog(`run-session reached the session cap (${sessionCurrent.session_image_cap ?? 64}).`);
        markSessionStep("STEP_SESSION_IMAGE_CAP_REACHED");
        break;
      }

      const nextWide = pickNextBatch(descriptionsBefore, "16:9");
      if (submitBatch(nextWide, "16:9")) {
        didWork = true;
      }

      const sessionAfterWide = readSession();
      if (sessionCapReached(sessionAfterWide)) {
        appendLog(`run-session reached the session cap after wide batch (${sessionAfterWide.session_image_cap ?? 64}).`);
        markSessionStep("STEP_SESSION_IMAGE_CAP_REACHED");
        break;
      }

      const descriptionsAfterWide = readDescriptions().descriptions ?? [];
      const nextSquare = pickNextBatch(descriptionsAfterWide, "1:1");
      if (submitBatch(nextSquare, "1:1")) {
        didWork = true;
      }

      const sessionAfter = readSession();
      const descriptionsAfter = readDescriptions().descriptions ?? [];
      const hasReadyPrompts = descriptionsAfter.some((item) => item.status === "ready" && !item.deferred_until_next_session);
      const hasPendingCapture = needsRenderCapture(sessionAfter) !== null;
      const hasFailures = hasOutstandingFailures(sessionAfter);

      if (!hasReadyPrompts && !hasPendingCapture && !hasFailures && !sessionCapReached(sessionAfter) && extendPromptInventoryIfNeeded(sessionAfter)) {
        appendLog("run-session regenerated additional loop variants because the prompt inventory exhausted before the session cap.");
        continue;
      }

      if (!didWork && !hasReadyPrompts && !hasPendingCapture && !hasFailures) {
        appendLog("run-session found no more ready prompts, pending renders, or failures. Image-creation session is complete.");
        markSessionStep("STEP_IMAGE_CREATION_SESSION_COMPLETED");
        break;
      }

      if (!didWork && (hasReadyPrompts || hasPendingCapture || hasFailures)) {
        throw new Error("run-session made no progress while work still remains. Manual intervention may be required.");
      }
    }
  } finally {
    releaseRunSessionLock();
  }
}

main();
