import fs from "node:fs";
import path from "node:path";
import {
  AUTOMATION_LOG_PATH,
  DESCRIPTIONS_PATH,
  IMAGE_REGISTRY_PATH,
  SESSION_STATE_PATH,
  TREND_DATA_PATH,
} from "../project_paths";
import { jsonTimestamp } from "../common/time";

type Trend = {
  id: number;
  topic: string;
  category?: string;
  summary?: string;
  visual_targets?: string[];
  commercial_use_cases?: string[];
  commercial_tags?: string[];
};

type TrendDataFile = {
  generated_at?: string | null;
  session_date?: string | null;
  trends?: Trend[];
};

type Description = {
  id: number;
  trend_id: number;
  trend_topic: string;
  series_slot: string;
  aspect_ratio: "16:9" | "1:1";
  quantity: 1;
  prompt_text: string;
  commercial_tags: string[];
  status: string;
  prompt_batch: number;
  prompt_batch_type: "wide" | "square";
  deferred_until_next_session: boolean;
};

type CarryForwardTrend = Trend & {
  carried_forward_at?: string | null;
  source?: string | null;
};

type DescriptionsFile = {
  generated_at?: string | null;
  total_descriptions?: number;
  session_active_descriptions?: number;
  deferred_descriptions?: number;
  session_image_cap?: number;
  session_aspect_cap?: number;
  session_trend_cap?: number;
  loop_index?: number;
  descriptions_per_trend?: number;
  series_structure?: Record<string, string[]>;
  carry_forward_trends?: CarryForwardTrend[];
  descriptions?: Description[];
};

type SessionState = {
  session_date?: string;
  current_stage?: string | null;
  last_completed_stage?: string | null;
  current_step?: string | null;
  current_description_index?: number | null;
  current_trend_id?: number | null;
  current_series_slot?: string | null;
  images_created_count?: number;
  images_downloaded_count?: number;
  images_created_16x9_count?: number;
  images_created_1x1_count?: number;
  session_image_cap?: number;
  session_aspect_cap?: number;
  session_upscale_batch_size?: number;
  session_trend_cap?: number;
  remaining_session_image_capacity?: number;
  remaining_16x9_capacity?: number;
  remaining_1x1_capacity?: number;
  queued_trend_ids?: number[];
  deferred_trend_ids?: number[];
  downloaded_images?: Array<{ saved_path?: string | null }>;
};

type RegistryFile = {
  images?: Record<string, { trend_topic?: string | null }>;
};

const SESSION_IMAGE_CAP = 64;
const SESSION_ASPECT_CAP = 32;
const DESCRIPTIONS_PER_TREND = 8;
const SESSION_TREND_CAP = SESSION_IMAGE_CAP / DESCRIPTIONS_PER_TREND;

const SERIES_STRUCTURE = {
  "16:9": ["16A_establishing", "16B_detail", "16C_scale", "16D_alt"],
  "1:1": ["1A_iconic", "1B_variation", "1C_closeup", "1D_isolated"],
} as const;

const SLOT_PURPOSE: Record<string, string> = {
  "16A_establishing": "wide establishing shot",
  "16B_detail": "horizontal close-up detail",
  "16C_scale": "overhead or scale scene",
  "16D_alt": "alternate wide demographic or mood variation",
  "1A_iconic": "centered square hero portrait",
  "1B_variation": "extreme square close-up",
  "1C_closeup": "top-down or flat-lay square composition",
  "1D_isolated": "square alternate demographic or culture-forward variation",
};

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

function appendLog(message: string): void {
  fs.mkdirSync(path.dirname(AUTOMATION_LOG_PATH), { recursive: true });
  fs.appendFileSync(AUTOMATION_LOG_PATH, `${jsonTimestamp()} ${message}\n`, "utf8");
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value ?? "").trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function normalizeTopicKey(topic: string): string {
  return topic.trim().toLowerCase();
}

function mergeTrendQueue(existing: CarryForwardTrend[], current: Trend[]): CarryForwardTrend[] {
  const merged = new Map<string, CarryForwardTrend>();
  for (const trend of existing) {
    const key = normalizeTopicKey(trend.topic);
    if (!key) continue;
    merged.set(key, { ...trend, source: trend.source ?? "carry_forward" });
  }
  for (const trend of current) {
    const key = normalizeTopicKey(trend.topic);
    if (!key) continue;
    const previous = merged.get(key);
    merged.set(key, {
      ...previous,
      ...trend,
      carried_forward_at: previous?.carried_forward_at ?? null,
      source: previous ? previous.source ?? "carry_forward" : "current_research",
    });
  }
  return [...merged.values()];
}

function fulfilledTrendTopics(registry: RegistryFile): Set<string> {
  const counts = new Map<string, number>();
  for (const entry of Object.values(registry.images ?? {})) {
    const topic = String(entry?.trend_topic ?? "").trim();
    if (!topic) continue;
    const key = normalizeTopicKey(topic);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= DESCRIPTIONS_PER_TREND)
      .map(([topic]) => topic),
  );
}

function bestVisual(trend: CarryForwardTrend, index: number): string {
  const targets = trend.visual_targets ?? [];
  if (targets.length) {
    return targets[index % targets.length];
  }
  return trend.summary ?? trend.topic;
}

function bestUseCase(trend: CarryForwardTrend, index: number): string {
  const cases = trend.commercial_use_cases ?? [];
  if (cases.length) {
    return cases[index % cases.length];
  }
  return trend.category ?? "commercial stock licensing";
}

function bestTags(trend: CarryForwardTrend): string[] {
  return uniqueStrings([
    ...(trend.commercial_tags ?? []),
    ...(trend.commercial_use_cases ?? []),
    trend.category,
    trend.topic,
  ]).slice(0, 6);
}

function buildPrompt(trend: CarryForwardTrend, seriesSlot: string, promptBatchType: "wide" | "square"): string {
  const visual = bestVisual(trend, promptBatchType === "wide" ? 0 : 1);
  const useCase = bestUseCase(trend, promptBatchType === "wide" ? 0 : 1);
  const summary = trend.summary ?? trend.topic;
  const purpose = SLOT_PURPOSE[seriesSlot] ?? "commercial stock image";
  const orientation = promptBatchType === "wide" ? "photorealistic wide commercial composition" : "photorealistic square commercial composition";
  return `${purpose} for ${trend.topic}, featuring ${visual}, built for ${useCase}, ${summary}, clean premium stock-photo realism, commercially useful, distinct composition, ${orientation}`;
}

function buildDescriptionsForTrend(trend: CarryForwardTrend, startId: number, deferred: boolean): Description[] {
  const descriptions: Description[] = [];
  let id = startId;
  for (const seriesSlot of SERIES_STRUCTURE["16:9"]) {
    descriptions.push({
      id,
      trend_id: trend.id,
      trend_topic: trend.topic,
      series_slot: seriesSlot,
      aspect_ratio: "16:9",
      quantity: 1,
      prompt_text: buildPrompt(trend, seriesSlot, "wide"),
      commercial_tags: bestTags(trend),
      status: deferred ? "deferred_next_session" : "ready",
      prompt_batch: 1,
      prompt_batch_type: "wide",
      deferred_until_next_session: deferred,
    });
    id += 1;
  }
  for (const seriesSlot of SERIES_STRUCTURE["1:1"]) {
    descriptions.push({
      id,
      trend_id: trend.id,
      trend_topic: trend.topic,
      series_slot: seriesSlot,
      aspect_ratio: "1:1",
      quantity: 1,
      prompt_text: buildPrompt(trend, seriesSlot, "square"),
      commercial_tags: bestTags(trend),
      status: deferred ? "deferred_next_session" : "ready",
      prompt_batch: 2,
      prompt_batch_type: "square",
      deferred_until_next_session: deferred,
    });
    id += 1;
  }
  return descriptions;
}

function main(): void {
  const trendData = readJson<TrendDataFile>(TREND_DATA_PATH, { trends: [] });
  const existingDescriptions = readJson<DescriptionsFile>(DESCRIPTIONS_PATH, { descriptions: [], carry_forward_trends: [] });
  const session = readJson<SessionState>(SESSION_STATE_PATH, {});
  const registry = readJson<RegistryFile>(IMAGE_REGISTRY_PATH, { images: {} });
  const completedTopics = fulfilledTrendTopics(registry);
  const existingActiveDescriptions = (existingDescriptions.descriptions ?? []).filter((description) =>
    !["ready", "deferred_next_session"].includes(description.status),
  );
  const hasLiveSessionProgress = (session.images_created_count ?? 0) > 0
    || (session.images_downloaded_count ?? 0) > 0
    || (session.downloaded_images?.length ?? 0) > 0
    || existingActiveDescriptions.length > 0;

  if (hasLiveSessionProgress) {
    throw new Error(
      "Refusing to rebuild descriptions for an in-progress session. Start a new session first, or finish/reconcile the current run before rebuilding the prompt inventory.",
    );
  }

  const currentSessionImageCap = session.session_image_cap ?? SESSION_IMAGE_CAP;
  const currentSessionAspectCap = session.session_aspect_cap ?? SESSION_ASPECT_CAP;
  const currentSessionTrendCap = session.session_trend_cap ?? SESSION_TREND_CAP;
  const remainingImageCapacity = Math.max(0, session.remaining_session_image_capacity ?? currentSessionImageCap);
  const remainingWideCapacity = Math.max(0, session.remaining_16x9_capacity ?? currentSessionAspectCap);
  const remainingSquareCapacity = Math.max(0, session.remaining_1x1_capacity ?? currentSessionAspectCap);
  const remainingTrendCapacity = Math.max(
    0,
    Math.min(
      currentSessionTrendCap,
      Math.floor(remainingImageCapacity / DESCRIPTIONS_PER_TREND),
      Math.floor(remainingWideCapacity / 4),
      Math.floor(remainingSquareCapacity / 4),
    ),
  );

  const trendQueue = mergeTrendQueue(existingDescriptions.carry_forward_trends ?? [], trendData.trends ?? [])
    .filter((trend) => !completedTopics.has(normalizeTopicKey(trend.topic)));
  const queuedToday = trendQueue.slice(0, remainingTrendCapacity);
  const carryForward = trendQueue.slice(remainingTrendCapacity).map((trend) => ({
    ...trend,
    carried_forward_at: jsonTimestamp(),
    source: trend.source ?? "carry_forward",
  }));

  let nextId = 1;
  const descriptions: Description[] = [];
  for (const trend of queuedToday) {
    const built = buildDescriptionsForTrend(trend, nextId, false);
    descriptions.push(...built);
    nextId += built.length;
  }
  for (const trend of carryForward) {
    const built = buildDescriptionsForTrend(trend, nextId, true);
    descriptions.push(...built);
    nextId += built.length;
  }

  const output: DescriptionsFile = {
    generated_at: jsonTimestamp(),
    total_descriptions: descriptions.length,
    session_active_descriptions: queuedToday.length * DESCRIPTIONS_PER_TREND,
    deferred_descriptions: carryForward.length * DESCRIPTIONS_PER_TREND,
    session_image_cap: currentSessionImageCap,
    session_aspect_cap: currentSessionAspectCap,
    session_trend_cap: currentSessionTrendCap,
    loop_index: typeof existingDescriptions.loop_index === "number" ? existingDescriptions.loop_index + 1 : 1,
    descriptions_per_trend: DESCRIPTIONS_PER_TREND,
    series_structure: SERIES_STRUCTURE as unknown as Record<string, string[]>,
    carry_forward_trends: carryForward,
    descriptions,
  };

  session.session_image_cap = currentSessionImageCap;
  session.session_aspect_cap = currentSessionAspectCap;
  session.session_upscale_batch_size = 16;
  session.session_trend_cap = currentSessionTrendCap;
  session.remaining_session_image_capacity = remainingImageCapacity;
  session.remaining_16x9_capacity = remainingWideCapacity;
  session.remaining_1x1_capacity = remainingSquareCapacity;
  session.queued_trend_ids = queuedToday.map((trend) => trend.id);
  session.deferred_trend_ids = carryForward.map((trend) => trend.id);
  session.current_description_index = queuedToday.length ? descriptions[0]?.id ?? null : null;
  session.current_trend_id = queuedToday[0]?.id ?? null;
  session.current_series_slot = queuedToday.length ? SERIES_STRUCTURE["16:9"][0] : null;
  session.current_step = queuedToday.length ? "STEP_DESCRIPTION_INVENTORY_BUILT" : "STEP_NO_TRENDS_AVAILABLE";

  writeJson(DESCRIPTIONS_PATH, output);
  writeJson(SESSION_STATE_PATH, session);

  appendLog(
    `Description inventory built dynamically. session_trends=${queuedToday.length}, session_prompts=${output.session_active_descriptions}, carry_forward=${carryForward.length}, total_prompts=${descriptions.length}.`,
  );
}

main();
