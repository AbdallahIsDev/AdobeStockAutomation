import type { Browser, Page } from "playwright";
import type { StagehandConnection } from "@bac/stagehand_core";

export interface AdobeSkillResult {
  success: boolean;
  error?: string;
}

export interface AdobeConnection {
  browser: Browser;
  page: Page;
  stagehand: StagehandConnection;
}

export interface AdobeMetadata {
  title?: string;
  title_char_count?: number;
  keywords?: string[];
  keyword_count?: number;
  category?: string;
  file_type?: string;
  created_with_ai?: boolean;
  people_are_fictional?: boolean;
  property_is_fictional?: boolean;
  editorial_use_only?: boolean;
}

export const ADOBE_URL_PATTERN = "contributor.stock.adobe.com";
export const ADOBE_OPEN_URL = "https://contributor.stock.adobe.com/en/uploads";

export function resultFromError(error: unknown): AdobeSkillResult {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[ADOBE] ${message}`);
  return { success: false, error: message };
}
