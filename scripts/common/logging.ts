import fs from "node:fs";
import path from "node:path";
import { AUTOMATION_LOG_PATH, LOGS_DIR } from "../project_paths";
import { jsonTimestamp } from "./time";

export type LogLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

const LOG_RETENTION_DAYS = 3;

function ensureLogDir(): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function pruneAutomationLog(): void {
  if (!fs.existsSync(AUTOMATION_LOG_PATH)) {
    return;
  }

  const retentionCutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const lines = fs.readFileSync(AUTOMATION_LOG_PATH, "utf8").split(/\r?\n/).filter(Boolean);
  const kept = lines.filter((line) => {
    const match = line.match(/^(\d{4}-\d{2}-\d{2})(?:__|\s{1,2})(\d{2}):(\d{2}):(\d{2}) (AM|PM)/);
    if (!match) {
      return true;
    }
    const [, datePart, hh12, mm, ss, ampm] = match;
    let hour = Number.parseInt(hh12, 10) % 12;
    if (ampm === "PM") {
      hour += 12;
    }
    const parsed = new Date(`${datePart}T${String(hour).padStart(2, "0")}:${mm}:${ss}`);
    return Number.isNaN(parsed.getTime()) || parsed.getTime() >= retentionCutoff;
  });

  fs.writeFileSync(AUTOMATION_LOG_PATH, kept.length ? `${kept.join("\n")}\n` : "", "utf8");
}

export function appendAutomationLog(message: string, level: LogLevel = "INFO"): void {
  ensureLogDir();
  pruneAutomationLog();
  const lines = message
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return;
  }

  const payload = lines.map((line) => {
    const inferred = level === "INFO"
      ? inferLevelFromMessage(line)
      : level;
    return `${jsonTimestamp()} [${inferred}] ${line}`;
  }).join("\n");

  fs.appendFileSync(AUTOMATION_LOG_PATH, `${payload}\n`, "utf8");
}

function inferLevelFromMessage(message: string): LogLevel {
  const lower = message.toLowerCase();
  if (/\b(failed|failure|error|missing output|could not|timed out)\b/.test(lower)) {
    return "ERROR";
  }
  if (/\b(warn|warning|skipped|deferred|fallback|review)\b/.test(lower)) {
    return "WARN";
  }
  if (/\b(succeeded|success|complete|completed|applied|updated|queued|written|captured|repaired)\b/.test(lower)) {
    return "SUCCESS";
  }
  return "INFO";
}

export function moveJsonReportIfPresent(oldPath: string, newPath: string): void {
  if (!fs.existsSync(oldPath) || fs.existsSync(newPath)) {
    return;
  }
  fs.mkdirSync(path.dirname(newPath), { recursive: true });
  fs.renameSync(oldPath, newPath);
}
