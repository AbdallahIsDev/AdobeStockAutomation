import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { AUTOMATION_LOG_PATH, ROOT, SESSION_STATE_PATH } from "../project_paths";
import { jsonTimestamp } from "../common/time";

type FailedPrompt = {
  prompt_id?: number | null;
};

type BatchRecord = {
  prompt_ids?: number[];
  aspect_ratio?: string;
  failed_prompts?: FailedPrompt[];
  submitted_at?: string | null;
};

type SessionState = {
  active_batches?: BatchRecord[];
  last_render_batch?: BatchRecord;
};

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function appendLog(message: string): void {
  fs.appendFileSync(AUTOMATION_LOG_PATH, `${jsonTimestamp()} ${message}\n`, "utf8");
}

function pickFailedBatch(session: SessionState): BatchRecord | null {
  const active = [...(session.active_batches ?? [])]
    .reverse()
    .find((batch) => (batch.failed_prompts ?? []).some((item) => typeof item.prompt_id === "number"));
  if (active) {
    return active;
  }
  if ((session.last_render_batch?.failed_prompts ?? []).some((item) => typeof item.prompt_id === "number")) {
    return session.last_render_batch ?? null;
  }
  return null;
}

function main(): void {
  const session = readJson<SessionState>(SESSION_STATE_PATH, {});
  const batch = pickFailedBatch(session);
  if (!batch) {
    appendLog("Retry-failed requested, but there are no failed prompts to retry.");
    return;
  }

  const promptIds = (batch.failed_prompts ?? [])
    .map((item) => item.prompt_id)
    .filter((value): value is number => typeof value === "number");
  const aspect = batch.aspect_ratio === "1:1" ? "1:1" : "16:9";
  if (!promptIds.length) {
    appendLog("Retry-failed requested, but the selected batch contained no numeric prompt ids.");
    return;
  }

  appendLog(`Retrying failed prompts via runtime command: ${promptIds.join(", ")} at ${aspect}.`);
  const workerPath = path.join(ROOT, "scripts", "flow", "flow_batch_submit_worker.ts");
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "tsx",
      workerPath,
      `--prompt-ids=${promptIds.join(",")}`,
      `--aspect=${aspect}`,
      "--wait-for-outcomes",
      "--retry-failed",
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      stdio: "inherit",
      shell: true,
    },
  );

  if (result.status !== 0) {
    throw new Error(`Retry-failed worker exited with code ${result.status ?? -1}.`);
  }
}

main();
