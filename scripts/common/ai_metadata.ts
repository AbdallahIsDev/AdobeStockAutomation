import fs from "node:fs";
import path from "node:path";
import { DESCRIPTIONS_PATH, TREND_DATA_PATH } from "../project_paths";
import { jsonTimestamp } from "./time";

type Description = {
  id: number;
  trend_id: number;
  trend_topic: string;
  loop_index?: number;
  series_slot: string;
  aspect_ratio: string;
  prompt_text: string;
  commercial_tags?: string[];
};

type Trend = {
  id: number;
  topic: string;
  category: string;
  commercial_use_cases?: string[];
  visual_keywords?: string[];
};

type MetadataContext = {
  imagePath: string;
  mediaName: string;
  promptId: number;
  downloadedAt?: string | null;
  modelUsed?: string | null;
};

type PromptMetadataSeed = {
  title: string;
  keywords: string[];
  category: string;
};

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
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

function extractTitleFromPrompt(prompt: string): string {
  const firstClause = prompt.split(",")[0] ?? prompt;
  const cleaned = firstClause
    .replace(/^(centered square portrait of|centered square collaboration scene of|wide cinematic shot of|bird'?s[- ]eye overhead (?:view|composition) of|top-down square flat-lay of|extreme square close-up of|wide shot of|close-up of|portrait of|photo of)\s+/i, "")
    .replace(/\b(a|an|the)\b\s+/gi, "")
    .replace(/\bstanding in front of\b/gi, "with")
    .replace(/\s+/g, " ")
    .trim();
  return shortenAtWordBoundary(toTitleCase(cleaned));
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

function extractPromptKeywords(prompt: string): string[] {
  return prompt
    .split(/[,:]/)
    .flatMap((part) => part.split(/\bwith\b|\band\b/gi))
    .map((part) => normalizeKeyword(part))
    .filter((part) => part.length > 3 && part.length <= 40)
    .slice(0, 24);
}

function detectCompositionTerms(prompt: string, seriesSlot: string): string[] {
  const haystack = `${seriesSlot} ${prompt}`.toLowerCase();
  const terms: string[] = [];
  if (/(bird'?s[- ]eye|overhead|top-down|top down)/.test(haystack)) {
    terms.push("top view", "overhead view", "bird's eye view");
  }
  if (/flat[- ]lay|flat lay/.test(haystack)) {
    terms.push("flat lay", "top down composition", "arranged objects");
  }
  if (/close-up|close up|macro/.test(haystack)) {
    terms.push("close up", "macro detail", "shallow depth of field");
  }
  if (/portrait/.test(haystack)) {
    terms.push("portrait", "focused expression", "person looking at camera");
  }
  if (/wide|panoramic|establishing/.test(haystack)) {
    terms.push("wide shot", "establishing scene", "panoramic composition");
  }
  if (/collaboration|team/.test(haystack)) {
    terms.push("teamwork", "professional collaboration");
  }
  return terms;
}

function detectVisualDetailTerms(prompt: string): string[] {
  const haystack = prompt.toLowerCase();
  const terms: string[] = [];
  const pairs: Array<[RegExp, string[]]> = [
    [/\bhand\b|\bhands\b|\bfingertip\b/, ["hand holding", "human hand", "hand detail"]],
    [/\bcard\b|\bpayment card\b|\bgreeting card\b/, ["card", "card in hand", "printed card"]],
    [/\bwith love\b/, ["with love text", "greeting card message", "romantic message"]],
    [/\btablet\b/, ["tablet screen", "digital tablet", "tablet device"]],
    [/\blaptop\b/, ["laptop", "computer screen", "digital workspace"]],
    [/\bphone\b|\bsmartphone\b|\bmobile\b/, ["smartphone", "mobile screen", "phone in hand"]],
    [/\breceipt\b|\breceipts\b/, ["receipt", "expense tracking", "printed receipt"]],
    [/\bmonitor\b|\bdashboard\b|\bscreen\b/, ["dashboard screen", "digital display", "screen interface"]],
    [/\bserver\b|\brack\b/, ["server rack", "data center", "technology hardware"]],
    [/\beye\b|\biris\b/, ["human eye", "eye close up", "iris detail"]],
    [/\bcoffee\b/, ["coffee cup", "desk coffee", "office coffee"]],
    [/\bgrocer(?:y|ies)\b/, ["groceries", "household shopping", "budget planning"]],
    [/\bpassport\b/, ["passport", "travel document", "identity document"]],
    [/\bnotebook\b|\bnotes\b/, ["notebook", "written notes", "planning notes"]],
    [/\bdiagram\b|\bschematic\b|\bmap\b/, ["planning diagram", "technical diagram", "visual planning"]],
  ];

  for (const [pattern, values] of pairs) {
    if (pattern.test(haystack)) {
      terms.push(...values);
    }
  }

  return terms;
}

function boostKeywordCount(baseKeywords: string[], prompt: string, title: string, trendTopic: string, visualKeywords: string[], commercialUseCases: string[], seriesSlot: string): string[] {
  const expanded = dedupeKeywords([
    ...baseKeywords,
    ...detectCompositionTerms(prompt, seriesSlot),
    ...detectVisualDetailTerms(prompt),
    ...visualKeywords,
    ...commercialUseCases,
    ...trendTopic.split(/\s+/),
    ...title.split(/\s+/),
    "commercial stock image",
    "buyer intent",
  ]);
  return expanded.slice(0, 35);
}

function inferAdobeCategory(trendCategory: string, prompt: string): string {
  const haystack = `${trendCategory} ${prompt}`.toLowerCase();
  if (/(fintech|payments|finance|business|commerce|corporate|enterprise|workspace)/.test(haystack)) {
    return "Business";
  }
  if (/(technology|ai|data|server|cloud|infrastructure|digital|software|monitor)/.test(haystack)) {
    return "Technology";
  }
  if (/(person|portrait|engineer|employee|manager|team)/.test(haystack)) {
    return "People";
  }
  return "Business";
}

export function buildPromptMetadataSeed(input: {
  trendTopic: string;
  trendCategory: string;
  prompt: string;
  visualKeywords?: string[];
  commercialUseCases?: string[];
  seriesSlot?: string;
}): PromptMetadataSeed {
  const title = extractTitleFromPrompt(input.prompt);
  const seedKeywords = dedupeKeywords([
    title,
    input.trendTopic,
    ...(input.visualKeywords ?? []),
    ...extractPromptKeywords(input.prompt),
    ...(input.commercialUseCases ?? []),
  ]);
  const keywords = boostKeywordCount(
    seedKeywords,
    input.prompt,
    title,
    input.trendTopic,
    input.visualKeywords ?? [],
    input.commercialUseCases ?? [],
    input.seriesSlot ?? "",
  );
  const category = inferAdobeCategory(input.trendCategory, input.prompt);

  return { title, keywords, category };
}

export function buildAiMetadataContext(context: MetadataContext): Record<string, unknown> {
  const descriptionsPayload = readJson<{ descriptions?: Description[] }>(DESCRIPTIONS_PATH, {});
  const trendPayload = readJson<{ trends?: Trend[] }>(TREND_DATA_PATH, {});
  const description = (descriptionsPayload.descriptions ?? []).find((item) => item.id === context.promptId);
  if (!description) {
    throw new Error(`Description not found for prompt ${context.promptId}.`);
  }
  const trend = (trendPayload.trends ?? []).find((item) => item.id === description.trend_id);
  const prompt = description.prompt_text;
  const { title, keywords, category } = buildPromptMetadataSeed({
    trendTopic: description.trend_topic,
    trendCategory: trend?.category ?? "",
    prompt,
    visualKeywords: trend?.visual_keywords ?? description.commercial_tags ?? [],
    commercialUseCases: trend?.commercial_use_cases ?? [],
    seriesSlot: description.series_slot,
  });

  return {
    image_file: path.basename(context.imagePath),
    generated_at: context.downloadedAt ?? jsonTimestamp(),
    source: "ai_generated",
    series_slot: description.series_slot,
    aspect_ratio: description.aspect_ratio,
    trend_topic: description.trend_topic,
    trend_category: trend?.category ?? null,
    loop_index: description.loop_index ?? 1,
    adobe_stock_metadata: {
      title,
      title_char_count: title.length,
      keywords,
      keyword_count: keywords.length,
      category,
      file_type: "Photos",
      created_with_ai: true,
      people_are_fictional: true,
      property_is_fictional: true,
      editorial_use_only: false,
    },
    generation_context: {
      prompt_used: prompt,
      model_used: context.modelUsed ?? "Nano Banana 2 / Flow",
      commercial_use_cases: trend?.commercial_use_cases ?? [],
      visual_keywords_from_trend: trend?.visual_keywords ?? description.commercial_tags ?? [],
    },
    metadata_generation_mode: "prompt_context_seed",
    status: "ready_for_upload",
    applied_to_adobe_stock: false,
    media_name: context.mediaName,
  };
}
