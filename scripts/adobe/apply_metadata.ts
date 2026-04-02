import fs from "node:fs";
import path from "node:path";
import type { Page } from "playwright";
import { connectBrowser, getOrOpenPage, fastClick, fastFill, waitForElement } from "C:/Users/11/browser-automation-core/browser_core";
import {
  ADOBE_OUTSIDE_SYSTEM_DIR,
  DOWNLOADS_DIR,
  IMAGE_REGISTRY_PATH,
  REPORTS_DIR,
  ROOT,
} from "../project_paths";
import { jsonTimestamp } from "../common/time";
import { appendAutomationLog, moveJsonReportIfPresent } from "../common/logging";
import { listSidecarFiles } from "../common/sidecars";
import { loadAdobeSelectors, saveAdobeSelectors, type AdobeSelectorMap } from "./selector_cache";

type AdobeMetadata = {
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
};

type Sidecar = {
  image_file?: string;
  source?: string;
  status?: string;
  applied_to_adobe_stock?: boolean;
  applied_at?: string;
  metadata_generation_mode?: string;
  generation_context?: {
    prompt_used?: string | null;
    commercial_use_cases?: string[];
    visual_keywords_from_trend?: string[];
    model_used?: string | null;
  };
  adobe_stock_metadata?: AdobeMetadata;
};

type MatchResult = {
  sidecarPath: string | null;
  imagePath: string | null;
  sidecar: Sidecar;
  matchedBy: string;
};

type PanelState = {
  originalName: string;
  currentTitle: string;
  currentKeywords: string[];
  currentCategory: string;
  currentFileType: string;
  currentLanguage: string;
  keywordSuggestions: string[];
  aiChecked: boolean;
  fictionalChecked: boolean;
};

type RegistryEntry = Record<string, unknown> & {
  source?: string;
  final_name?: string;
  original_name?: string;
  source_path?: string | null;
  dimensions?: { width: number; height: number } | null;
  long_side?: number | null;
  assigned_scale?: number | "copy_only" | "low_res" | "external" | null;
  metadata_sidecar?: string | null;
  upscaled?: boolean;
  upscaled_path?: string | null;
  upscaled_dimensions?: { width: number; height: number } | null;
  registered_at?: string | null;
  upscaled_at?: string | null;
  adobe_stock_status?: string;
  adobe_apply_status?: string;
  adobe_applied_at?: string;
  trend_topic?: string | null;
  series_slot?: string | null;
  prompt_id?: number | null;
  media_name?: string | null;
  adobe_only?: boolean;
};

type RegistryFile = {
  last_updated?: string;
  total_images?: number;
  images?: Record<string, RegistryEntry>;
};

type MetadataPlan = {
  match: MatchResult;
  desiredMetadata: AdobeMetadata;
  action: "checked_only" | "update_from_sidecar" | "rebuilt_from_current" | "rebuilt_from_fallback";
  sourceType: "pipeline" | "outside_system";
  reason: string;
  needsApply: boolean;
  applyFields: ApplyFields;
};

type ApplyFields = {
  language: boolean;
  fileType: boolean;
  category: boolean;
  aiDisclosure: boolean;
  fictional: boolean;
  title: boolean;
  keywords: boolean;
};

const TARGET_URL = "https://contributor.stock.adobe.com/en/uploads";
const TARGET_DATE = readArg("date") ?? "2026-03-28";
const TARGET_TOKEN = TARGET_DATE.replaceAll("-", "");
const PAGE_LIMIT = parseInt(readArg("page-limit") ?? "999", 10);
const ITEM_LIMIT = parseInt(readArg("item-limit") ?? "9999", 10);
const ONLY_NAME = readArg("only-name");
const CHECK_ONLY = (readArg("mode") ?? process.env.ADOBE_APPLY_MODE ?? "apply").toLowerCase() === "check";
const REPORT_PATH = path.join(REPORTS_DIR, "adobe_apply_report.json");
const LEGACY_REPORT_PATH = path.join(ROOT, "logs", "adobe_apply_report.json");

function readArg(name: string): string | null {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return arg ? arg.split("=", 2)[1] ?? null : null;
}

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

function windowsRelative(filePath: string): string {
  return path.relative(ROOT, filePath).replaceAll("/", "\\");
}

function normalizeNameKey(input: string): string {
  return input.trim().toLowerCase().replace(/\.[a-z0-9]+$/i, "");
}

function normalizeTitle(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function cleanOriginalName(originalName: string): string {
  return originalName
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\bmanual\b/gi, "")
    .replace(/\b[0-9a-f]{4,}\b/gi, "")
    .replace(/\bM\d{3,}\b/g, "")
    .replace(/\b\d{8}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toTitleCase(input: string): string {
  return input.replace(/\w\S*/g, (word) => `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`);
}

function shortenAtWordBoundary(input: string, maxLength = 68): string {
  if (input.length <= maxLength) {
    return input.trim();
  }
  const cut = input.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
}

function buildTitle(originalName: string): string {
  const cleaned = cleanOriginalName(originalName);
  const candidate = cleaned.length > 0 ? cleaned : originalName;
  const title = shortenAtWordBoundary(toTitleCase(candidate));
  return title.length <= 68 ? title : title.slice(0, 68).trimEnd();
}

function looksWeakTitle(title: string): boolean {
  const normalized = normalizeTitle(title);
  return (
    normalized.length < 8 ||
    !/[a-z]{3}/.test(normalized) ||
    /[0-9a-f]{6,}/i.test(normalized) ||
    normalized.startsWith("image ") ||
    normalized.startsWith("untitled ") ||
    normalized.includes(" stock photo ") ||
    normalized.includes(" ai generated")
  );
}

function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function dedupeKeywords(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = normalizeKeyword(raw);
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function keywordOverlapRatio(left: string[], right: string[]): number {
  const leftSet = new Set(left.map(normalizeKeyword).filter(Boolean));
  const rightSet = new Set(right.map(normalizeKeyword).filter(Boolean));
  if (leftSet.size === 0 && rightSet.size === 0) {
    return 1;
  }
  const shared = [...leftSet].filter((value) => rightSet.has(value)).length;
  return shared / Math.max(leftSet.size, rightSet.size, 1);
}

function inferCategory(title: string, suggestions: string[], currentCategory: string): string {
  const haystack = `${title} ${suggestions.join(" ")}`.toLowerCase();
  if (/(dog|cat|animal|pet|canine|puppy|labrador|retriever|wildlife|bird)/.test(haystack)) {
    return "Animals";
  }
  if (currentCategory && !["Category", "Animals"].includes(currentCategory)) {
    return currentCategory;
  }
  if (/(server|data|circuit|monitor|technology|computer|network|cloud|ai|software)/.test(haystack)) {
    return "Technology";
  }
  if (/(office|meeting|business|finance|team|corporate|workflow|presentation|dashboard)/.test(haystack)) {
    return "Business";
  }
  if (/(portrait|person|people|employee|manager|worker|collaboration|engineer)/.test(haystack)) {
    return "People";
  }
  return "Business";
}

function buildFallbackMetadata(panelState: PanelState, sidecar: Sidecar): AdobeMetadata {
  const builtTitle = buildTitle(panelState.originalName);
  const title = looksWeakTitle(builtTitle) && panelState.keywordSuggestions.length >= 2
    ? shortenAtWordBoundary(toTitleCase(panelState.keywordSuggestions.slice(0, 4).join(" ")))
    : builtTitle;
  const fileTerms = cleanOriginalName(panelState.originalName)
    .split(" ")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 2);

  const trendTerms = sidecar.generation_context?.visual_keywords_from_trend ?? [];
  const useCaseTerms = sidecar.generation_context?.commercial_use_cases ?? [];
  const keywords = dedupeKeywords([
    title,
    ...panelState.keywordSuggestions,
    ...trendTerms,
    ...useCaseTerms,
    ...fileTerms,
    "commercial use",
    "stock image",
  ]).slice(0, 30);

  const createdWithAi = sidecar.adobe_stock_metadata?.created_with_ai ?? panelState.aiChecked;
  const category = inferCategory(title, panelState.keywordSuggestions, panelState.currentCategory);
  const fileType = sidecar.adobe_stock_metadata?.file_type ?? panelState.currentFileType ?? "Photos";

  return {
    title,
    title_char_count: title.length,
    keywords,
    keyword_count: keywords.length,
    category,
    file_type: fileType,
    created_with_ai: createdWithAi,
    people_are_fictional: createdWithAi ? true : false,
    property_is_fictional: createdWithAi ? true : false,
    editorial_use_only: false,
  };
}

function buildCurrentPanelMetadata(panelState: PanelState): AdobeMetadata {
  const title = shortenAtWordBoundary(panelState.currentTitle || buildTitle(panelState.originalName));
  const keywords = dedupeKeywords(panelState.currentKeywords).slice(0, 49);
  const category = panelState.currentCategory || inferCategory(title, panelState.keywordSuggestions, panelState.currentCategory);
  const fileType = panelState.currentFileType || "Photos";

  return {
    title,
    title_char_count: title.length,
    keywords,
    keyword_count: keywords.length,
    category,
    file_type: fileType,
    created_with_ai: panelState.aiChecked,
    people_are_fictional: panelState.fictionalChecked,
    property_is_fictional: panelState.fictionalChecked,
    editorial_use_only: false,
  };
}

function metadataProblems(metadata: AdobeMetadata, panelState: PanelState): string[] {
  const problems: string[] = [];
  const title = metadata.title?.trim() ?? "";
  const keywords = metadata.keywords ?? [];
  const category = metadata.category?.trim() ?? "";
  const expectedCategory = inferCategory(title || panelState.originalName, panelState.keywordSuggestions, panelState.currentCategory);

  if (!title || looksWeakTitle(title) || title.length > 70) {
    problems.push("weak_title");
  }
  if (keywords.length < 20) {
    problems.push("too_few_keywords");
  }
  if (keywords.some((keyword) => /[0-9a-f]{6,}/i.test(keyword))) {
    problems.push("filename_or_hash_keyword");
  }
  if (!category || category === "Category") {
    problems.push("missing_category");
  } else if (category !== expectedCategory && expectedCategory !== "Business") {
    problems.push("category_mismatch");
  }
  if ((metadata.file_type ?? "").trim().length === 0) {
    problems.push("missing_file_type");
  }
  return problems;
}

function isReadyPipelineSidecar(sidecar: Sidecar): boolean {
  const metadata = sidecar.adobe_stock_metadata;
  if (sidecar.status !== "ready_for_upload" || !metadata) {
    return false;
  }
  if (!metadata.title || !metadata.keywords || !metadata.category) {
    return false;
  }
  if (metadata.title.includes("[NEEDS") || metadata.category.includes("[NEEDS")) {
    return false;
  }
  if (metadata.keywords.length < 20) {
    return false;
  }
  return !looksWeakTitle(metadata.title);
}

function metadataMatchesPanel(metadata: AdobeMetadata, panelState: PanelState): boolean {
  const titleMatches = normalizeTitle(metadata.title ?? "") === normalizeTitle(panelState.currentTitle ?? "");
  const categoryMatches = (metadata.category ?? "").trim() === (panelState.currentCategory ?? "").trim();
  const fileTypeMatches = (metadata.file_type ?? "Photos").trim() === (panelState.currentFileType ?? "").trim();
  const aiMatches = Boolean(metadata.created_with_ai) === panelState.aiChecked;
  const fictionalMatches = Boolean(metadata.people_are_fictional || metadata.property_is_fictional) === panelState.fictionalChecked;
  const keywordMatch = keywordOverlapRatio(metadata.keywords ?? [], panelState.currentKeywords ?? []) >= 0.8;

  return titleMatches && categoryMatches && fileTypeMatches && aiMatches && fictionalMatches && keywordMatch;
}

function buildApplyFields(metadata: AdobeMetadata, panelState: PanelState): ApplyFields {
  return {
    language: (panelState.currentLanguage ?? "").trim().toLowerCase() !== "english",
    fileType: (metadata.file_type ?? "Photos").trim() !== (panelState.currentFileType ?? "").trim(),
    category: (metadata.category ?? "").trim() !== (panelState.currentCategory ?? "").trim(),
    aiDisclosure: Boolean(metadata.created_with_ai) !== panelState.aiChecked,
    fictional: Boolean(metadata.people_are_fictional || metadata.property_is_fictional) !== panelState.fictionalChecked,
    title: normalizeTitle(metadata.title ?? "") !== normalizeTitle(panelState.currentTitle ?? ""),
    keywords: keywordOverlapRatio(metadata.keywords ?? [], panelState.currentKeywords ?? []) < 0.8,
  };
}

function hasApplyWork(fields: ApplyFields): boolean {
  return Object.values(fields).some(Boolean);
}

function buildSidecarIndex(): Map<string, MatchResult> {
  const index = new Map<string, MatchResult>();
  const folders = [path.join(DOWNLOADS_DIR, "upscaled", TARGET_DATE), path.join(ADOBE_OUTSIDE_SYSTEM_DIR, TARGET_DATE)];

  for (const folder of folders) {
    if (!fs.existsSync(folder)) {
      continue;
    }
    const sidecarPaths = folder.includes("adobe_outside_system")
      ? fs.readdirSync(folder, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith(".metadata.json"))
        .map((entry) => path.join(folder, entry.name))
      : listSidecarFiles(folder);

    for (const sidecarPath of sidecarPaths) {
      const entryName = path.basename(sidecarPath);
      const sidecar = readJson<Sidecar>(sidecarPath, {});
      const sidecarStem = entryName.replace(/\.metadata\.json$/i, "");
      const imageFile = sidecar.image_file ?? `${sidecarStem}.png`;
      const imagePath = path.join(folder, imageFile);
      const match: MatchResult = {
        sidecarPath,
        imagePath: fs.existsSync(imagePath) ? imagePath : null,
        sidecar,
        matchedBy: folder.includes("adobe_outside_system") ? "outside-system-sidecar" : "exact",
      };

      for (const key of new Set([normalizeNameKey(sidecarStem), normalizeNameKey(imageFile)])) {
        index.set(key, match);
      }
    }
  }

  return index;
}

function findMatch(index: Map<string, MatchResult>, originalName: string): MatchResult {
  const normalized = normalizeNameKey(originalName);
  const exact = index.get(normalized);
  if (exact) {
    return exact;
  }
  const fuzzy = [...index.entries()].find(([key]) => key.includes(normalized) || normalized.includes(key));
  if (fuzzy) {
    return { ...fuzzy[1], matchedBy: "fuzzy" };
  }
  return { sidecarPath: null, imagePath: null, sidecar: {}, matchedBy: "missing" };
}

function buildOutsideSystemSidecarPath(originalName: string): string {
  const stem = originalName.replace(/\.[a-z0-9]+$/i, "");
  const folder = path.join(ADOBE_OUTSIDE_SYSTEM_DIR, TARGET_DATE);
  fs.mkdirSync(folder, { recursive: true });
  return path.join(folder, `${stem}.metadata.json`);
}

function buildPreparedSidecar(originalName: string, match: MatchResult, metadata: AdobeMetadata, source: string): Sidecar {
  return {
    ...match.sidecar,
    image_file: originalName,
    source,
    status: "ready_for_upload",
    adobe_stock_metadata: {
      ...metadata,
      title_char_count: metadata.title?.length ?? 0,
      keyword_count: metadata.keywords?.length ?? 0,
    },
    applied_to_adobe_stock: false,
  };
}

function persistPreparedSidecar(originalName: string, match: MatchResult, metadata: AdobeMetadata, source: string): MatchResult {
  const sidecarPath = match.sidecarPath ?? buildOutsideSystemSidecarPath(originalName);
  const sidecar = buildPreparedSidecar(originalName, match, metadata, source);
  writeJson(sidecarPath, sidecar);
  return {
    sidecarPath,
    imagePath: match.imagePath,
    sidecar,
    matchedBy: match.sidecarPath ? match.matchedBy : "outside-system-created",
  };
}

function normalizeRegistry(registry: RegistryFile | Record<string, RegistryEntry>): RegistryFile {
  if ("images" in registry && typeof registry.images === "object") {
    return {
      last_updated: (registry as RegistryFile).last_updated ?? null,
      total_images: (registry as RegistryFile).total_images ?? Object.keys((registry as RegistryFile).images ?? {}).length,
      images: { ...((registry as RegistryFile).images ?? {}) },
    };
  }

  return {
    last_updated: null,
    total_images: Object.keys(registry).length,
    images: { ...(registry as Record<string, RegistryEntry>) },
  };
}

function upsertRegistry(originalName: string, match: MatchResult, sourceType: "pipeline" | "outside_system"): void {
  const registry = normalizeRegistry(readJson<RegistryFile | Record<string, RegistryEntry>>(IMAGE_REGISTRY_PATH, { images: {} }));
  const images = registry.images ?? {};
  let targetKey: string | null = null;

  for (const [key, entry] of Object.entries(images)) {
    const combined = [entry.image_file, entry.final_name, entry.original_name, entry.upscaled_path, entry.metadata_sidecar]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (combined.includes(normalizeNameKey(originalName))) {
      targetKey = key;
      break;
    }
  }

  const now = jsonTimestamp();
  if (!targetKey) {
    targetKey = originalName;
    images[targetKey] = {
      source: sourceType === "outside_system" ? "outside_system" : (match.sidecar.source ?? "ai_generated"),
      final_name: originalName,
      original_name: originalName,
      source_path: null,
      dimensions: null,
      long_side: null,
      assigned_scale: "external",
      metadata_sidecar: match.sidecarPath ? windowsRelative(match.sidecarPath) : null,
      upscaled: false,
      upscaled_path: match.imagePath ? windowsRelative(match.imagePath) : null,
      upscaled_dimensions: null,
      registered_at: now,
      upscaled_at: null,
      adobe_stock_status: "ready_for_manual_review",
      adobe_apply_status: "applied",
      adobe_applied_at: now,
      adobe_only: sourceType === "outside_system",
    };
  } else {
    const entry = images[targetKey];
    entry.metadata_sidecar = match.sidecarPath ? windowsRelative(match.sidecarPath) : entry.metadata_sidecar ?? null;
    if (match.imagePath) {
      entry.upscaled_path = windowsRelative(match.imagePath);
    }
    entry.adobe_apply_status = "applied";
    entry.adobe_applied_at = now;
    entry.adobe_stock_status = entry.adobe_stock_status ?? "ready_for_manual_review";
  }

  registry.images = images;
  registry.total_images = Object.keys(images).length;
  registry.last_updated = now;
  writeJson(IMAGE_REGISTRY_PATH, registry);
}

function prepareMetadataPlan(originalName: string, match: MatchResult, panelState: PanelState): MetadataPlan {
  const pipelineReady = isReadyPipelineSidecar(match.sidecar);
  if (pipelineReady) {
    const desiredMetadata = match.sidecar.adobe_stock_metadata ?? {};
    const applyFields = buildApplyFields(desiredMetadata, panelState);
    return {
      match,
      desiredMetadata,
      action: hasApplyWork(applyFields) ? "update_from_sidecar" : "checked_only",
      sourceType: "pipeline",
      reason: hasApplyWork(applyFields) ? "panel_differs_from_sidecar_or_adobe_only_fields" : "panel_already_matches_sidecar",
      needsApply: hasApplyWork(applyFields),
      applyFields,
    };
  }

  const currentMetadata = buildCurrentPanelMetadata(panelState);
  const currentProblems = metadataProblems(currentMetadata, panelState);

  if (currentProblems.length === 0) {
    const persisted = CHECK_ONLY
      ? match
      : persistPreparedSidecar(originalName, match, currentMetadata, match.sidecar.source ?? "outside_system");
    return {
      match: persisted,
      desiredMetadata: currentMetadata,
      action: "rebuilt_from_current",
      sourceType: "outside_system",
      reason: "strong_existing_adobe_metadata_captured_into_sidecar",
      needsApply: false,
      applyFields: buildApplyFields(currentMetadata, panelState),
    };
  }

  const fallbackMetadata = buildFallbackMetadata(panelState, match.sidecar);
  const persisted = CHECK_ONLY
    ? match
    : persistPreparedSidecar(originalName, match, fallbackMetadata, match.sidecar.source ?? "outside_system");
  return {
    match: persisted,
    desiredMetadata: fallbackMetadata,
    action: "rebuilt_from_fallback",
    sourceType: "outside_system",
    reason: `weak_existing_metadata:${currentProblems.join(",")}`,
    needsApply: true,
    applyFields: buildApplyFields(fallbackMetadata, panelState),
  };
}

async function ensureNewTab(page: Page, selectors: AdobeSelectorMap): Promise<void> {
  await waitForElement(page, selectors.newTab, 10000);
  await fastClick(page, selectors.newTab);
  await page.waitForLoadState("domcontentloaded");
}

async function extractOriginalName(page: Page, selectors: AdobeSelectorMap): Promise<string> {
  const footerText = (await page.locator(selectors.footer).innerText()).trim();
  const match = footerText.match(/Original name\(s\):\s*([^\n]+?)(?:\s*Actions:|$)/i);
  if (!match?.[1]) {
    throw new Error(`Could not parse original name from Adobe footer: ${footerText}`);
  }
  return match[1].trim();
}

async function readSelectedOption(page: Page, selector: string): Promise<string> {
  return page.locator(selector).evaluate((node) => {
    const select = node as HTMLSelectElement;
    return select.selectedOptions[0]?.textContent?.trim() ?? "";
  });
}

async function getKeywordSuggestions(page: Page, selectors: AdobeSelectorMap): Promise<string[]> {
  return page.locator(`${selectors.keywordSuggestionsGroup} button`).evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.trim() ?? "").filter((value) => value.length > 0),
  );
}

async function getCurrentKeywords(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll("button"))
      .map((node) => (node.textContent ?? "").trim())
      .filter((value) => /remove keyword$/i.test(value))
      .map((value) => value.replace(/remove keyword$/i, "").trim())
      .filter((value) => value.length > 0);
  });
}

async function readPanelState(page: Page, selectors: AdobeSelectorMap): Promise<PanelState> {
  const originalName = await extractOriginalName(page, selectors);
  return {
    originalName,
    currentTitle: await page.locator(selectors.titleInput).inputValue().catch(() => ""),
    currentKeywords: await getCurrentKeywords(page),
    currentCategory: await readSelectedOption(page, `select[name="category"]`).catch(() => ""),
    currentFileType: await readSelectedOption(page, `select[name="contentType"]`).catch(() => ""),
    currentLanguage: await readSelectedOption(page, `select[name="language"]`).catch(() => ""),
    keywordSuggestions: await getKeywordSuggestions(page, selectors),
    aiChecked: await page.locator(selectors.aiCheckbox).isChecked().catch(() => false),
    fictionalChecked: await page.locator(selectors.fictionalCheckbox).isChecked().catch(() => false),
  };
}

async function selectThumbnail(page: Page, selectors: AdobeSelectorMap, index: number, previousOriginalName: string | null): Promise<string> {
  const thumb = page.locator(selectors.gridThumbnails).nth(index);
  await thumb.scrollIntoViewIfNeeded();
  await thumb.click({ timeout: 10000 });
  await page.waitForFunction(
    ({ selector, previous }) => {
      const footer = document.querySelector(selector);
      if (!footer) {
        return false;
      }
      const text = footer.textContent ?? "";
      const match = text.match(/Original name\(s\):\s*([^\n]+?)(?:\s*Actions:|$)/i);
      if (!match?.[1]) {
        return false;
      }
      const current = match[1].trim();
      return previous ? current !== previous : current.length > 0;
    },
    { selector: selectors.footer, previous: previousOriginalName },
    { timeout: 10000 },
  );
  return extractOriginalName(page, selectors);
}

async function setSelectLabel(page: Page, selector: string, label: string): Promise<void> {
  const options = await page.locator(`${selector} option`).evaluateAll((nodes) =>
    nodes.map((node) => (node.textContent ?? "").trim()).filter((value) => value.length > 0),
  );
  const target = options.find((option) => option.toLowerCase() === label.trim().toLowerCase())
    ?? options.find((option) => option.toLowerCase().includes(label.trim().toLowerCase()))
    ?? null;
  if (!target) {
    throw new Error(`Select option not found for ${selector}: ${label}. Available: ${options.join(", ")}`);
  }
  await page.selectOption(selector, { label: target });
}

async function setCheckbox(page: Page, selector: string, checked: boolean): Promise<void> {
  const locator = page.locator(selector);
  if ((await locator.count()) === 0) {
    return;
  }
  if ((await locator.isChecked()) !== checked) {
    await locator.click();
  }
}

async function setKeywords(page: Page, selectors: AdobeSelectorMap, keywords: string[]): Promise<void> {
  if ((await page.locator(selectors.eraseKeywordsButton).count()) > 0) {
    await fastClick(page, selectors.eraseKeywordsButton);
    await page.waitForTimeout(300);
  }
  await fastFill(page, selectors.keywordsTextarea, keywords.join(", "));
}

async function applyMetadata(page: Page, selectors: AdobeSelectorMap, originalName: string, plan: MetadataPlan): Promise<void> {
  const metadata = plan.desiredMetadata;
  if (!metadata.title || !metadata.keywords || metadata.keywords.length < 5 || !metadata.category) {
    throw new Error(`Incomplete metadata for ${originalName}`);
  }

  if (plan.needsApply && !CHECK_ONLY) {
    const fields = plan.applyFields;
    let changed = false;

    if (fields.language) {
      await setSelectLabel(page, `select[name="language"]`, "English");
      changed = true;
    }
    if (fields.fileType) {
      await setSelectLabel(page, `select[name="contentType"]`, metadata.file_type ?? "Photos");
      changed = true;
    }
    if (fields.category) {
      await setSelectLabel(page, `select[name="category"]`, metadata.category);
      changed = true;
    }

    if (fields.aiDisclosure || fields.fictional) {
      await setCheckbox(page, selectors.aiCheckbox, Boolean(metadata.created_with_ai));
      if (metadata.created_with_ai) {
        await page.waitForTimeout(300);
        await setCheckbox(page, selectors.fictionalCheckbox, Boolean(metadata.people_are_fictional || metadata.property_is_fictional));
      } else if ((await page.locator(selectors.releasesNo).count()) > 0) {
        await page.evaluate((selector) => {
          const input = document.querySelector(selector) as HTMLInputElement | null;
          if (input) {
            input.click();
          }
        }, selectors.releasesNo);
      }
      changed = true;
    }

    if (fields.title) {
      await fastFill(page, selectors.titleInput, metadata.title);
      changed = true;
    }
    if (fields.keywords) {
      await setKeywords(page, selectors, metadata.keywords);
      changed = true;
    }

    if (changed) {
      await fastClick(page, selectors.saveButton);
      await page.waitForTimeout(1200);
    }
  }

  if (plan.match.sidecarPath && !CHECK_ONLY) {
    const updated: Sidecar = {
      ...plan.match.sidecar,
      applied_to_adobe_stock: true,
      applied_at: jsonTimestamp(),
      status: "ready_for_upload",
      adobe_stock_metadata: {
        ...metadata,
        title_char_count: metadata.title.length,
        keyword_count: metadata.keywords.length,
      },
    };
    writeJson(plan.match.sidecarPath, updated);
    plan.match.sidecar = updated;
  }

  if (!CHECK_ONLY) {
    upsertRegistry(originalName, plan.match, plan.sourceType);
  }
  appendAutomationLog(
    `Adobe metadata ${CHECK_ONLY ? "checked" : (plan.action === "checked_only" ? "checked" : "updated")} for ${originalName} using ${plan.match.matchedBy}. Reason: ${plan.reason}.`,
    CHECK_ONLY || plan.action === "checked_only" ? "INFO" : "SUCCESS",
  );
}

async function clickNextPage(page: Page): Promise<boolean> {
  const next = page.getByRole("link", { name: "Next" });
  if ((await next.count()) === 0) {
    return false;
  }
  if ((await next.getAttribute("aria-disabled")) === "true") {
    return false;
  }
  await next.click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(800);
  return true;
}

async function main(): Promise<void> {
  const browser = await connectBrowser(9222);
  moveJsonReportIfPresent(LEGACY_REPORT_PATH, REPORT_PATH);
  const report = {
    started_at: jsonTimestamp(),
    target_date: TARGET_DATE,
    checked: 0,
    updated: 0,
    rebuilt: 0,
    skipped: 0,
    failed: 0,
    pages_processed: 0,
    items_processed: 0,
    errors: [] as string[],
  };

  try {
    const page = await getOrOpenPage(browser, "contributor.stock.adobe.com/en/uploads", TARGET_URL);
    await page.bringToFront();
    await page.waitForLoadState("domcontentloaded");

    const selectors = loadAdobeSelectors().selectors;
    saveAdobeSelectors(selectors);
    await ensureNewTab(page, selectors);

    const sidecarIndex = buildSidecarIndex();
    let pageNumber = 1;

    while (pageNumber <= PAGE_LIMIT && report.items_processed < ITEM_LIMIT) {
      const thumbCount = await page.locator(selectors.gridThumbnails).count();
      let previousOriginalName: string | null = null;

      for (let index = 0; index < thumbCount && report.items_processed < ITEM_LIMIT; index += 1) {
        try {
          const originalName = await selectThumbnail(page, selectors, index, previousOriginalName);
          previousOriginalName = originalName;

          if (!originalName.includes(TARGET_TOKEN)) {
            report.skipped += 1;
            appendAutomationLog(`Adobe metadata skipped for ${originalName} because it is outside ${TARGET_DATE}.`, "INFO");
            continue;
          }
          if (ONLY_NAME && originalName !== ONLY_NAME) {
            report.skipped += 1;
            continue;
          }

          report.items_processed += 1;
          if (report.items_processed > ITEM_LIMIT) {
            break;
          }

          const panelState = await readPanelState(page, selectors);
          const match = findMatch(sidecarIndex, originalName);

          if (match.sidecar.status === "analysis_failed") {
            report.skipped += 1;
            appendAutomationLog(`Adobe metadata skipped for ${originalName} because File 03 marked analysis_failed.`, "WARN");
            continue;
          }

          const plan = prepareMetadataPlan(originalName, match, panelState);
          report.checked += 1;
          if (plan.action === "update_from_sidecar") {
            report.updated += 1;
          }
          if (plan.action === "rebuilt_from_current" || plan.action === "rebuilt_from_fallback") {
            report.rebuilt += 1;
          }

          await applyMetadata(page, selectors, originalName, plan);
        } catch (error) {
          report.failed += 1;
          const message = error instanceof Error ? error.message : String(error);
          report.errors.push(`Page ${pageNumber}, item ${index + 1}: ${message}`);
          appendAutomationLog(`Adobe metadata failed on page ${pageNumber}, item ${index + 1}: ${message}`, "ERROR");
        }
      }

      report.pages_processed += 1;
      if (!(await clickNextPage(page))) {
        break;
      }
      pageNumber += 1;
    }
  } finally {
    writeJson(REPORT_PATH, { ...report, ended_at: jsonTimestamp() });
    appendAutomationLog(
      `Adobe metadata ${CHECK_ONLY ? "check" : "apply"} summary for ${TARGET_DATE}: ${report.checked} checked | ${report.updated} updated | ${report.rebuilt} rebuilt | ${report.skipped} skipped | ${report.failed} failed.`,
      report.failed > 0 ? "WARN" : "SUCCESS",
    );
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
