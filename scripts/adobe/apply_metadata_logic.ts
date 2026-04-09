import fs from "node:fs";
import path from "node:path";
import { ADOBE_OUTSIDE_SYSTEM_DIR, DOWNLOADS_DIR, ROOT } from "../project_paths";
import { listSidecarFiles } from "../common/sidecars";
import type {
  AdobeMetadata,
  ApplyFields,
  MatchResult,
  PanelState,
  Sidecar,
} from "./apply_metadata_types";

export const CHECK_ONLY = (readArg("mode") ?? process.env.ADOBE_APPLY_MODE ?? "apply").toLowerCase() === "check";
export const TARGET_DATE = readArg("date") ?? "2026-03-28";
export const TARGET_TOKEN = TARGET_DATE.replaceAll("-", "");
export const PAGE_LIMIT = parseInt(readArg("page-limit") ?? "999", 10);
export const ITEM_LIMIT = parseInt(readArg("item-limit") ?? "9999", 10);
export const ONLY_NAME = readArg("only-name");

export function readArg(name: string): string | null {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  return arg ? arg.split("=", 2)[1] ?? null : null;
}

export function readJson<T>(filePath: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")) as T; }
  catch { return fallback; }
}

export function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function windowsRelative(filePath: string): string {
  return path.relative(ROOT, filePath).replaceAll("/", "\\");
}

export function normalizeNameKey(input: string): string {
  return input.trim().toLowerCase().replace(/\.[a-z0-9]+$/i, "");
}

export function normalizeTitle(input: string): string {
  return input.toLowerCase().replace(/\s+/g, " ").trim();
}

function cleanOriginalName(originalName: string): string {
  return originalName
    .replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ")
    .replace(/\bmanual\b/gi, "").replace(/\b[0-9a-f]{4,}\b/gi, "")
    .replace(/\bM\d{3,}\b/g, "").replace(/\b\d{8}\b/g, "")
    .replace(/\s+/g, " ").trim();
}

function toTitleCase(input: string): string {
  return input.replace(/\w\S*/g, (word) => `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`);
}

function shortenAtWordBoundary(input: string, maxLength = 68): string {
  if (input.length <= maxLength) return input.trim();
  const cut = input.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
}

export function buildTitle(originalName: string): string {
  const cleaned = cleanOriginalName(originalName);
  const candidate = cleaned.length > 0 ? cleaned : originalName;
  const title = shortenAtWordBoundary(toTitleCase(candidate));
  return title.length <= 68 ? title : title.slice(0, 68).trimEnd();
}

export function looksWeakTitle(title: string): boolean {
  const normalized = normalizeTitle(title);
  return (
    normalized.length < 8 || !/[a-z]{3}/.test(normalized) ||
    /[0-9a-f]{6,}/i.test(normalized) || normalized.startsWith("image ") ||
    normalized.startsWith("untitled ") || normalized.includes(" stock photo ") ||
    normalized.includes(" ai generated")
  );
}

function normalizeKeyword(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function dedupeKeywords(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = normalizeKeyword(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function keywordOverlapRatio(left: string[], right: string[]): number {
  const leftSet = new Set(left.map(normalizeKeyword).filter(Boolean));
  const rightSet = new Set(right.map(normalizeKeyword).filter(Boolean));
  if (leftSet.size === 0 && rightSet.size === 0) return 1;
  const shared = [...leftSet].filter((value) => rightSet.has(value)).length;
  return shared / Math.max(leftSet.size, rightSet.size, 1);
}

export function inferCategory(title: string, suggestions: string[], currentCategory: string): string {
  const haystack = `${title} ${suggestions.join(" ")}`.toLowerCase();
  if (/(dog|cat|animal|pet|canine|puppy|labrador|retriever|wildlife|bird)/.test(haystack)) return "Animals";
  if (currentCategory && !["Category", "Animals"].includes(currentCategory)) return currentCategory;
  if (/(server|data|circuit|monitor|technology|computer|network|cloud|ai|software)/.test(haystack)) return "Technology";
  if (/(office|meeting|business|finance|team|corporate|workflow|presentation|dashboard)/.test(haystack)) return "Business";
  if (/(portrait|person|people|employee|manager|worker|collaboration|engineer)/.test(haystack)) return "People";
  return "Business";
}

export function buildFallbackMetadata(panelState: PanelState, sidecar: Sidecar): AdobeMetadata {
  const builtTitle = buildTitle(panelState.originalName);
  const title = looksWeakTitle(builtTitle) && panelState.keywordSuggestions.length >= 2
    ? shortenAtWordBoundary(toTitleCase(panelState.keywordSuggestions.slice(0, 4).join(" "))) : builtTitle;
  const fileTerms = cleanOriginalName(panelState.originalName).split(" ").map((p) => p.trim().toLowerCase()).filter((p) => p.length > 2);
  const trendTerms = sidecar.generation_context?.visual_keywords_from_trend ?? [];
  const useCaseTerms = sidecar.generation_context?.commercial_use_cases ?? [];
  const keywords = dedupeKeywords([title, ...panelState.keywordSuggestions, ...trendTerms, ...useCaseTerms, ...fileTerms, "commercial use", "stock image"]).slice(0, 30);
  const createdWithAi = sidecar.adobe_stock_metadata?.created_with_ai ?? panelState.aiChecked;
  const category = inferCategory(title, panelState.keywordSuggestions, panelState.currentCategory);
  const fileType = sidecar.adobe_stock_metadata?.file_type ?? panelState.currentFileType ?? "Photos";
  return {
    title, title_char_count: title.length, keywords, keyword_count: keywords.length,
    category, file_type: fileType, created_with_ai: createdWithAi,
    people_are_fictional: createdWithAi ? true : false,
    property_is_fictional: createdWithAi ? true : false, editorial_use_only: false,
  };
}

export function buildCurrentPanelMetadata(panelState: PanelState): AdobeMetadata {
  const title = shortenAtWordBoundary(panelState.currentTitle || buildTitle(panelState.originalName));
  const keywords = dedupeKeywords(panelState.currentKeywords).slice(0, 49);
  const category = panelState.currentCategory || inferCategory(title, panelState.keywordSuggestions, panelState.currentCategory);
  const fileType = panelState.currentFileType || "Photos";
  return {
    title, title_char_count: title.length, keywords, keyword_count: keywords.length,
    category, file_type: fileType, created_with_ai: panelState.aiChecked,
    people_are_fictional: panelState.fictionalChecked,
    property_is_fictional: panelState.fictionalChecked, editorial_use_only: false,
  };
}

export function metadataProblems(metadata: AdobeMetadata, panelState: PanelState): string[] {
  const problems: string[] = [];
  const title = metadata.title?.trim() ?? "";
  const keywords = metadata.keywords ?? [];
  const category = metadata.category?.trim() ?? "";
  const expectedCategory = inferCategory(title || panelState.originalName, panelState.keywordSuggestions, panelState.currentCategory);
  if (!title || looksWeakTitle(title) || title.length > 70) problems.push("weak_title");
  if (keywords.length < 20) problems.push("too_few_keywords");
  if (keywords.some((keyword) => /[0-9a-f]{6,}/i.test(keyword))) problems.push("filename_or_hash_keyword");
  if (!category || category === "Category") problems.push("missing_category");
  else if (category !== expectedCategory && expectedCategory !== "Business") problems.push("category_mismatch");
  if ((metadata.file_type ?? "").trim().length === 0) problems.push("missing_file_type");
  return problems;
}

export function isReadyPipelineSidecar(sidecar: Sidecar): boolean {
  const metadata = sidecar.adobe_stock_metadata;
  if (sidecar.status !== "ready_for_upload" || !metadata) return false;
  if (!metadata.title || !metadata.keywords || !metadata.category) return false;
  if (metadata.title.includes("[NEEDS") || metadata.category.includes("[NEEDS")) return false;
  if (metadata.keywords.length < 20) return false;
  return !looksWeakTitle(metadata.title);
}

export function metadataMatchesPanel(metadata: AdobeMetadata, panelState: PanelState): boolean {
  const titleMatches = normalizeTitle(metadata.title ?? "") === normalizeTitle(panelState.currentTitle ?? "");
  const categoryMatches = (metadata.category ?? "").trim() === (panelState.currentCategory ?? "").trim();
  const fileTypeMatches = (metadata.file_type ?? "Photos").trim() === (panelState.currentFileType ?? "").trim();
  const aiMatches = Boolean(metadata.created_with_ai) === panelState.aiChecked;
  const fictionalMatches = Boolean(metadata.people_are_fictional || metadata.property_is_fictional) === panelState.fictionalChecked;
  const keywordMatch = keywordOverlapRatio(metadata.keywords ?? [], panelState.currentKeywords ?? []) >= 0.8;
  return titleMatches && categoryMatches && fileTypeMatches && aiMatches && fictionalMatches && keywordMatch;
}

export function buildApplyFields(metadata: AdobeMetadata, panelState: PanelState): ApplyFields {
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

export function hasApplyWork(fields: ApplyFields): boolean {
  return Object.values(fields).some(Boolean);
}

export function buildSidecarIndex(): Map<string, MatchResult> {
  const index = new Map<string, MatchResult>();
  const folders = [path.join(DOWNLOADS_DIR, "upscaled", TARGET_DATE), path.join(ADOBE_OUTSIDE_SYSTEM_DIR, TARGET_DATE)];
  for (const folder of folders) {
    if (!fs.existsSync(folder)) continue;
    const sidecarPaths = folder.includes("adobe_outside_system")
      ? fs.readdirSync(folder, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith(".metadata.json")).map((e) => path.join(folder, e.name))
      : listSidecarFiles(folder);
    for (const sidecarPath of sidecarPaths) {
      const entryName = path.basename(sidecarPath);
      const sidecar = readJson<Sidecar>(sidecarPath, {});
      const sidecarStem = entryName.replace(/\.metadata\.json$/i, "");
      const imageFile = sidecar.image_file ?? `${sidecarStem}.png`;
      const imagePath = path.join(folder, imageFile);
      const match: MatchResult = {
        sidecarPath, imagePath: fs.existsSync(imagePath) ? imagePath : null, sidecar,
        matchedBy: folder.includes("adobe_outside_system") ? "outside-system-sidecar" : "exact",
      };
      for (const key of new Set([normalizeNameKey(sidecarStem), normalizeNameKey(imageFile)])) {
        index.set(key, match);
      }
    }
  }
  return index;
}

export function findMatch(index: Map<string, MatchResult>, originalName: string): MatchResult {
  const normalized = normalizeNameKey(originalName);
  const exact = index.get(normalized);
  if (exact) return exact;
  const fuzzy = [...index.entries()].find(([key]) => key.includes(normalized) || normalized.includes(key));
  if (fuzzy) return { ...fuzzy[1], matchedBy: "fuzzy" };
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
    ...match.sidecar, image_file: originalName, source, status: "ready_for_upload",
    adobe_stock_metadata: { ...metadata, title_char_count: metadata.title?.length ?? 0, keyword_count: metadata.keywords?.length ?? 0 },
    applied_to_adobe_stock: false,
  };
}

export function persistPreparedSidecar(originalName: string, match: MatchResult, metadata: AdobeMetadata, source: string): MatchResult {
  const sidecarPath = match.sidecarPath ?? buildOutsideSystemSidecarPath(originalName);
  const sidecar = buildPreparedSidecar(originalName, match, metadata, source);
  writeJson(sidecarPath, sidecar);
  return { sidecarPath, imagePath: match.imagePath, sidecar, matchedBy: match.sidecarPath ? match.matchedBy : "outside-system-created" };
}
