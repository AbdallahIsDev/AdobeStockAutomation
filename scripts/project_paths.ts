import path from "node:path";

export const ROOT = process.cwd();
export const INSTRUCTIONS_DIR = path.join(ROOT, "instructions");
export const SCRIPTS_DIR = path.join(ROOT, "scripts");
export const DATA_DIR = path.join(ROOT, "data");
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
