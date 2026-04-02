import fs from "node:fs";
import { DESCRIPTIONS_PATH } from "../project_paths";

type Description = {
  id: number;
  aspect_ratio: "16:9" | "1:1";
  series_slot: string;
};

type BatchRecord = {
  prompt_ids?: number[];
  aspect_ratio?: string;
  submitted_at?: string;
  rendered_media?: Array<{
    prompt_id?: number | null;
    media_name?: string;
  }>;
};

type DownloadedImage = {
  prompt_id?: number | null;
};

type SessionStateLike = {
  active_batches?: BatchRecord[];
  last_render_batch?: BatchRecord;
  downloaded_images?: DownloadedImage[];
};

type ResolveOptions = {
  downloadedAt?: string | null;
  allowUsedPromptFallback?: boolean;
};

function readDescriptions(): Description[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(DESCRIPTIONS_PATH, "utf8")) as { descriptions?: Description[] };
    return parsed.descriptions ?? [];
  } catch {
    return [];
  }
}

function inferSeriesSlotFromSuggestedFilename(suggestedFilename: string | undefined): string | null {
  const stem = String(suggestedFilename ?? "").toLowerCase();
  if (!stem) {
    return null;
  }
  if (stem.includes("wide_establishing")) return "16A_establishing";
  if (stem.includes("horizontal_close-up_detail") || stem.includes("horizontal_close_up_detail")) return "16B_detail";
  if (stem.includes("overhead_or_scale")) return "16C_scale";
  if (stem.includes("alternate_wide_demographic") || stem.includes("alternate_wide_mood")) return "16D_alt";
  if (stem.includes("centered_square_hero") || stem.includes("centered_square_portrait") || stem.includes("centered_square_collaboration")) return "1A_iconic";
  if (stem.includes("extreme_square_close-up") || stem.includes("extreme_square_close_up")) return "1B_variation";
  if (
    stem.includes("top-down_square")
    || stem.includes("top_down_square")
    || stem.includes("flat-lay_square")
    || stem.includes("flat_lay_square")
    || stem.includes("top-down_or_flat-lay")
    || stem.includes("top_down_or_flat_lay")
    || stem.includes("top-down_or_flat_lay")
    || stem.includes("top_down_or_flat-lay")
  ) return "1C_closeup";
  if (stem.includes("square_alternate_demographic") || stem.includes("square_alternate")) return "1D_isolated";
  return null;
}

function parseJsonTimestamp(value: string | null | undefined): number | null {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})__(\d{2}):(\d{2}):(\d{2})\s(AM|PM)$/i);
  if (!match) {
    return null;
  }
  const [, year, month, day, hourText, minute, second, meridiem] = match;
  let hour = Number.parseInt(hourText, 10) % 12;
  if (meridiem.toUpperCase() === "PM") {
    hour += 12;
  }
  const result = new Date(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
    hour,
    Number.parseInt(minute, 10),
    Number.parseInt(second, 10),
    0,
  ).getTime();
  return Number.isFinite(result) ? result : null;
}

function orderCandidateBatches(
  batches: BatchRecord[],
  downloadedAt: string | null | undefined,
): BatchRecord[] {
  const downloadedAtMs = parseJsonTimestamp(downloadedAt);
  if (downloadedAtMs == null) {
    return [...batches].reverse();
  }

  return [...batches].sort((a, b) => {
    const aTime = parseJsonTimestamp(a.submitted_at) ?? Number.NEGATIVE_INFINITY;
    const bTime = parseJsonTimestamp(b.submitted_at) ?? Number.NEGATIVE_INFINITY;
    const aPast = aTime <= downloadedAtMs ? 0 : 1;
    const bPast = bTime <= downloadedAtMs ? 0 : 1;
    if (aPast !== bPast) {
      return aPast - bPast;
    }
    const aDelta = Math.abs(downloadedAtMs - aTime);
    const bDelta = Math.abs(downloadedAtMs - bTime);
    if (aDelta !== bDelta) {
      return aDelta - bDelta;
    }
    return aTime - bTime;
  });
}

export function resolvePromptIdForDownload(
  session: SessionStateLike,
  mediaName: string,
  suggestedFilename?: string,
  options?: ResolveOptions,
): number | null {
  for (const batch of session.active_batches ?? []) {
    for (const item of batch.rendered_media ?? []) {
      if (item?.media_name === mediaName && typeof item.prompt_id === "number") {
        return item.prompt_id;
      }
    }
  }
  for (const item of session.last_render_batch?.rendered_media ?? []) {
    if (item?.media_name === mediaName && typeof item.prompt_id === "number") {
      return item.prompt_id;
    }
  }

  const seriesSlot = inferSeriesSlotFromSuggestedFilename(suggestedFilename);
  if (!seriesSlot) {
    return null;
  }

  const descriptions = readDescriptions();
  const descriptionsById = new Map(descriptions.map((item) => [item.id, item]));
  const usedPromptIds = new Set(
    (session.downloaded_images ?? [])
      .map((item) => item.prompt_id)
      .filter((value): value is number => typeof value === "number"),
  );
  const aspect = seriesSlot.startsWith("16") ? "16:9" : "1:1";
  const candidateBatches = orderCandidateBatches(
    [...(session.active_batches ?? [])].filter((batch) => batch.aspect_ratio === aspect),
    options?.downloadedAt,
  );

  for (const batch of candidateBatches) {
    for (const promptId of batch.prompt_ids ?? []) {
      const description = descriptionsById.get(promptId);
      if (!description) {
        continue;
      }
      if (description.series_slot !== seriesSlot) {
        continue;
      }
      if (usedPromptIds.has(promptId)) {
        continue;
      }
      return promptId;
    }
  }

  if (options?.allowUsedPromptFallback) {
    for (const batch of candidateBatches) {
      for (const promptId of batch.prompt_ids ?? []) {
        const description = descriptionsById.get(promptId);
        if (!description) {
          continue;
        }
        if (description.series_slot !== seriesSlot) {
          continue;
        }
        return promptId;
      }
    }
  }

  return null;
}
