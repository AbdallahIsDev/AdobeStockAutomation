import fs from "node:fs";
import path from "node:path";

declare const __dirname: string | undefined;

function findProjectRoot(): string {
  const candidateStarts = [
    typeof __dirname === "string" ? __dirname : null,
    process.argv[1] ? path.dirname(path.resolve(process.argv[1])) : null,
    process.cwd(),
  ].filter((value): value is string => Boolean(value));

  for (const start of candidateStarts) {
    let current = start;
    while (true) {
      if (
        fs.existsSync(path.join(current, "SKILL.md")) &&
        fs.existsSync(path.join(current, "instructions")) &&
        fs.existsSync(path.join(current, "scripts"))
      ) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return process.cwd();
}

export const ROOT = findProjectRoot();
export const INSTRUCTIONS_DIR = path.join(ROOT, "instructions");
export const SCRIPTS_DIR = path.join(ROOT, "scripts");
export const ADOBE_SCRIPTS_DIR = path.join(SCRIPTS_DIR, "adobe");
export const DATA_DIR = path.join(ROOT, "data");
export const ADOBE_OUTSIDE_SYSTEM_DIR = path.join(DATA_DIR, "adobe_outside_system");
export const REPORTS_DIR = path.join(DATA_DIR, "reports");
export const DOWNLOADS_DIR = path.join(ROOT, "downloads");
export const FAILED_DOWNLOADS_DIR = path.join(DOWNLOADS_DIR, "failed");
export const STAGING_DIR = path.join(ROOT, "staging");
export const LOGS_DIR = path.join(ROOT, "logs");
export const SCREENSHOTS_DIR = path.join(LOGS_DIR, "screenshots");
export const AUTOMATION_LOG_PATH = path.join(LOGS_DIR, "automation.log");

export const SUCCESS_REPORT_PATH = path.join(INSTRUCTIONS_DIR, "STOCK_SUCCESS_REPORT.md");
export const SKILL_PATH = path.join(ROOT, "SKILL.md");
export const TREND_RESEARCH_PATH = path.join(INSTRUCTIONS_DIR, "01_TREND_RESEARCH.md");
export const IMAGE_CREATION_PATH = path.join(INSTRUCTIONS_DIR, "02_IMAGE_CREATION.md");
export const IMAGE_UPSCALER_PATH = path.join(INSTRUCTIONS_DIR, "03_IMAGE_UPSCALER.md");
export const METADATA_OPTIMIZER_PATH = path.join(INSTRUCTIONS_DIR, "04_METADATA_OPTIMIZER.md");

export const INSTRUCTION_01_PATH = TREND_RESEARCH_PATH;
export const INSTRUCTION_02_PATH = IMAGE_CREATION_PATH;
export const INSTRUCTION_03_PATH = IMAGE_UPSCALER_PATH;
export const INSTRUCTION_04_PATH = METADATA_OPTIMIZER_PATH;

export const SESSION_STATE_PATH = path.join(DATA_DIR, "session_state.json");
export const IMAGE_REGISTRY_PATH = path.join(DATA_DIR, "image_registry.json");
export const UPSCALER_STATE_PATH = path.join(DATA_DIR, "upscaler_state.json");
export const DESCRIPTIONS_PATH = path.join(DATA_DIR, "descriptions.json");
export const TREND_DATA_PATH = path.join(DATA_DIR, "trend_data.json");
export const SELECTORS_REGISTRY_PATH = path.join(DATA_DIR, "selectors_registry.json");
export const ADOBE_STOCK_SELECTORS_PATH = path.join(DATA_DIR, "adobe_stock_selectors.json");
export const ADOBE_RUNTIME_PATH = path.join(SCRIPTS_DIR, "adobe_runtime.ts");
