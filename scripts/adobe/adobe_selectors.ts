import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import {
  mergeSelectorCache,
  saveSelectorCache,
  type SelectorCacheRecord,
} from "@bac/selector_store";
import { ADOBE_STOCK_SELECTORS_PATH } from "../project_paths";

export interface AdobeSelectorMap extends SelectorCacheRecord {
  selectorsDiscovered: boolean;
  discoveryNote: string;
  uploadButton: string | null;
  titleInput: string | null;
  keywordsTextarea: string | null;
  keywordSuggestionsGroup: string | null;
  categoryDropdown: string | null;
  submitButton: string | null;
  saveButton: string | null;
  uploadQueueItem: string | null;
  editMetadataButton: string | null;
  confirmUploadButton: string | null;
  successIndicator: string | null;
  errorIndicator: string | null;
  bulkEditButton: string | null;
  contentTypeToggle: string | null;
  newTab: string | null;
  grid: string | null;
  gridThumbnails: string | null;
  sidePanel: string | null;
  footer: string | null;
  aiCheckbox: string | null;
  fictionalCheckbox: string | null;
  releasesNo: string | null;
  eraseKeywordsButton: string | null;
  pagination: string | null;
}

const DEFAULT_SELECTORS: AdobeSelectorMap = {
  uploadButton: null,
  titleInput: `textarea[data-t="asset-title-content-tagger"]`,
  keywordsTextarea: `textarea[data-t="content-keywords-ui-textarea"]`,
  keywordSuggestionsGroup: `[data-t="content-tagger-keywords-tag-group"]`,
  categoryDropdown: null,
  submitButton: null,
  saveButton: `button:has-text("Save work")`,
  uploadQueueItem: null,
  editMetadataButton: null,
  confirmUploadButton: null,
  successIndicator: null,
  errorIndicator: null,
  bulkEditButton: null,
  contentTypeToggle: null,
  newTab: `[data-t="sub_menu_new"]`,
  grid: `[data-t="assets-content-grid"]`,
  gridThumbnails: `[data-t="assets-content-grid"] img[alt="thumbnail"]`,
  sidePanel: `[data-t="content-side-panel"]`,
  footer: `[data-t="asset-sidebar-footer"]`,
  aiCheckbox: `input[name="content-tagger-generative-ai-checkbox"]`,
  fictionalCheckbox: `input[name="content-tagger-generative-ai-property-release-checkbox"]`,
  releasesNo: `input[name="hasReleases"][value="no"]`,
  eraseKeywordsButton: `button:has-text("Erase all keywords")`,
  pagination: `[data-t="core-pagination"]`,
  selectorsDiscovered: false,
  discoveryNote: "Adobe Stock selectors have not been discovered yet.",
};

// Re-export selectorDescriptions from its own module for backward compatibility
export { selectorDescriptions } from "./adobe_selector_descriptions";

let cachedSelectors: AdobeSelectorMap | null = null;

export function getAdobeSelectorsPath(): string {
  return ADOBE_STOCK_SELECTORS_PATH;
}

/** Load the current Adobe selector cache from disk. */
export function loadAdobeSelectors(): AdobeSelectorMap {
  const jsonPath = getAdobeSelectorsPath();
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    // Handle the legacy nested format: { updated_at: "...", selectors: { ... } }
    if (raw && typeof raw === "object" && raw.selectors && typeof raw.selectors === "object") {
      const rawSelectors = raw.selectors as Record<string, unknown>;
      const cleanEntries = Object.entries(rawSelectors).filter(
        ([, v]) => v !== null && v !== undefined,
      );
      const hasAny = cleanEntries.length > 0;
      return {
        ...DEFAULT_SELECTORS,
        ...Object.fromEntries(cleanEntries),
        selectorsDiscovered: hasAny ? true : DEFAULT_SELECTORS.selectorsDiscovered,
      } as AdobeSelectorMap;
    }

    // Flat format — keys are at the top level (matches loadSelectorCache behavior)
    const flatEntries = Object.entries(raw as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined,
    );
    return { ...DEFAULT_SELECTORS, ...Object.fromEntries(flatEntries) } as AdobeSelectorMap;
  } catch {
    return { ...DEFAULT_SELECTORS };
  }
}

/** Return the cached Adobe selector map, loading lazily. */
export function getAdobeSelectors(): AdobeSelectorMap {
  if (!cachedSelectors) {
    cachedSelectors = loadAdobeSelectors();
  }
  return cachedSelectors;
}

export function invalidateAdobeSelectorsCache(): void {
  cachedSelectors = null;
}

/** Discover Adobe Stock selectors without dynamic code evaluation. */
export async function discoverAdobeSelectors(page: Page): Promise<AdobeSelectorMap> {
  invalidateAdobeSelectorsCache();
  const existing = loadAdobeSelectors();
  if (existing.selectorsDiscovered) {
    console.log("[ADOBE_SELECTORS] Using cached Adobe Stock selectors.");
    cachedSelectors = existing;
    return existing;
  }

  const found = await page.evaluate(() => {
    const selectorFrom = (element: Element | null): string | null => {
      if (!element) {
        return null;
      }
      const dataTest = element.getAttribute("data-t");
      if (dataTest) {
        return `[data-t="${dataTest}"]`;
      }
      const dataTestAttr = element.getAttribute("data-test");
      if (dataTestAttr) {
        return `[data-test="${dataTestAttr}"]`;
      }
      const dataTestId = element.getAttribute("data-testid");
      if (dataTestId) {
        return `[data-testid="${dataTestId}"]`;
      }
      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel) {
        return `[aria-label="${ariaLabel}"]`;
      }
      const htmlEl = element as HTMLElement;
      if (htmlEl.id) {
        return `#${htmlEl.id}`;
      }
      const className = String(htmlEl.className ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .join(".");
      return `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
    };

    const byExactText = (text: string, selector = "button, [role='button'], a"): Element | null =>
      Array.from(document.querySelectorAll(selector)).find((el) => {
        return (el as HTMLElement).innerText?.trim() === text;
      }) ?? null;

    const byAriaLabel = (value: string): Element | null =>
      document.querySelector(`[aria-label="${value}"]`);

    const byPlaceholder = (value: string): Element | null =>
      Array.from(document.querySelectorAll("input, textarea")).find((el) => {
        return (el as HTMLInputElement).placeholder?.toLowerCase().includes(value.toLowerCase());
      }) ?? null;

    const byDataT = (value: string): Element | null =>
      document.querySelector(`[data-t="${value}"]`);

    return {
      uploadButton: selectorFrom(byExactText("Upload") ?? byAriaLabel("Upload")),
      titleInput: selectorFrom(byDataT("asset-title-content-tagger") ?? byPlaceholder("title")),
      keywordsTextarea: selectorFrom(
        byDataT("content-keywords-ui-textarea") ?? byPlaceholder("keyword"),
      ),
      keywordSuggestionsGroup: selectorFrom(byDataT("content-tagger-keywords-tag-group")),
      categoryDropdown: selectorFrom(byAriaLabel("Category") ?? byExactText("Select category")),
      submitButton: selectorFrom(byExactText("Submit") ?? byExactText("Publish")),
      saveButton: selectorFrom(byExactText("Save work")),
      uploadQueueItem: selectorFrom(
        document.querySelector("[data-t*='upload-queue']") ??
          document.querySelector("[class*='upload-queue']"),
      ),
      editMetadataButton: selectorFrom(
        byAriaLabel("Edit metadata") ?? byExactText("Edit metadata"),
      ),
      confirmUploadButton: selectorFrom(
        byExactText("Confirm") ?? byAriaLabel("Confirm upload"),
      ),
      successIndicator: selectorFrom(
        document.querySelector("[role='status'], [role='alert']"),
      ),
      errorIndicator: selectorFrom(
        document.querySelector("[role='alert'], .error-message, [class*='error']"),
      ),
      bulkEditButton: selectorFrom(byAriaLabel("Bulk edit") ?? byExactText("Bulk edit")),
      contentTypeToggle: selectorFrom(
        byAriaLabel("Content type") ?? byExactText("Photo"),
      ),
      newTab: selectorFrom(byDataT("sub_menu_new")),
      grid: selectorFrom(byDataT("assets-content-grid")),
      gridThumbnails: selectorFrom(
        document.querySelector("[data-t='assets-content-grid'] img[alt='thumbnail']"),
      ),
      sidePanel: selectorFrom(byDataT("content-side-panel")),
      footer: selectorFrom(byDataT("asset-sidebar-footer")),
      aiCheckbox: selectorFrom(
        document.querySelector("input[name='content-tagger-generative-ai-checkbox']"),
      ),
      fictionalCheckbox: selectorFrom(
        document.querySelector(
          "input[name='content-tagger-generative-ai-property-release-checkbox']",
        ),
      ),
      releasesNo: selectorFrom(
        document.querySelector("input[name='hasReleases'][value='no']"),
      ),
      eraseKeywordsButton: selectorFrom(byExactText("Erase all keywords")),
      pagination: selectorFrom(byDataT("core-pagination")),
    };
  });

  const merged = mergeSelectorCache(existing, {
    ...(found as Partial<AdobeSelectorMap>),
    selectorsDiscovered: true,
    discoveryNote: `Adobe Stock selectors discovered from ${page.url()} at ${new Date().toISOString()}`,
  });

  cachedSelectors = merged;
  saveSelectorCache(merged, getAdobeSelectorsPath());
  console.log(`[ADOBE_SELECTORS] Saved selectors to ${getAdobeSelectorsPath()}`);
  return merged;
}
