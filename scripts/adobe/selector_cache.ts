import fs from "node:fs";
import path from "node:path";
import { ADOBE_STOCK_SELECTORS_PATH } from "../project_paths";
import { jsonTimestamp } from "../common/time";

export type AdobeSelectorMap = Record<string, string>;

export const DEFAULT_ADOBE_SELECTORS: AdobeSelectorMap = {
  newTab: `[data-t="sub_menu_new"]`,
  grid: `[data-t="assets-content-grid"]`,
  gridThumbnails: `[data-t="assets-content-grid"] img[alt="thumbnail"]`,
  sidePanel: `[data-t="content-side-panel"]`,
  titleInput: `textarea[data-t="asset-title-content-tagger"]`,
  keywordsTextarea: `textarea[data-t="content-keywords-ui-textarea"]`,
  keywordSuggestionsGroup: `[data-t="content-tagger-keywords-tag-group"]`,
  footer: `[data-t="asset-sidebar-footer"]`,
  aiCheckbox: `input[name="content-tagger-generative-ai-checkbox"]`,
  fictionalCheckbox: `input[name="content-tagger-generative-ai-property-release-checkbox"]`,
  releasesNo: `input[name="hasReleases"][value="no"]`,
  saveButton: `button:has-text("Save work")`,
  eraseKeywordsButton: `button:has-text("Erase all keywords")`,
  pagination: `[data-t="core-pagination"]`,
};

type SelectorStore = {
  updated_at: string | null;
  selectors: AdobeSelectorMap;
};

export function loadAdobeSelectors(): SelectorStore {
  try {
    const raw = fs.readFileSync(ADOBE_STOCK_SELECTORS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<SelectorStore>;
    return {
      updated_at: parsed.updated_at ?? null,
      selectors: {
        ...DEFAULT_ADOBE_SELECTORS,
        ...(parsed.selectors ?? {}),
      },
    };
  } catch {
    return {
      updated_at: null,
      selectors: { ...DEFAULT_ADOBE_SELECTORS },
    };
  }
}

export function saveAdobeSelectors(selectors: AdobeSelectorMap = DEFAULT_ADOBE_SELECTORS): void {
  fs.mkdirSync(path.dirname(ADOBE_STOCK_SELECTORS_PATH), { recursive: true });
  fs.writeFileSync(
    ADOBE_STOCK_SELECTORS_PATH,
    `${JSON.stringify({ updated_at: jsonTimestamp(), selectors }, null, 2)}\n`,
    "utf8",
  );
}
