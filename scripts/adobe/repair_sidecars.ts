import fs from "node:fs";
import path from "node:path";
import { DOWNLOADS_DIR, REPORTS_DIR, ROOT } from "../project_paths";
import { jsonTimestamp } from "../common/time";
import { buildPromptMetadataSeed } from "../common/ai_metadata";
import { moveJsonReportIfPresent } from "../common/logging";
import { listSidecarFiles } from "../common/sidecars";

type Sidecar = {
  image_file?: string;
  source?: string;
  trend_topic?: string | null;
  trend_category?: string | null;
  generation_context?: {
    prompt_used?: string | null;
    commercial_use_cases?: string[];
    visual_keywords_from_trend?: string[];
  };
  adobe_stock_metadata?: {
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
};

const TARGET_DATE = readArg("date") ?? "2026-03-28";
const REPORT_PATH = path.join(REPORTS_DIR, "adobe_sidecar_repair_report.json");
const LEGACY_REPORT_PATH = path.join(ROOT, "logs", "adobe_sidecar_repair_report.json");

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

function shouldRepair(sidecar: Sidecar): boolean {
  if (sidecar.source === "manual") {
    return false;
  }
  const meta = sidecar.adobe_stock_metadata;
  if (!meta?.title || !meta.keywords || !sidecar.generation_context?.prompt_used) {
    return false;
  }
  return (
    /\b2k\b/i.test(meta.title) ||
    /\b(and|with|of)$/i.test(meta.title) ||
    /\b(centered square|bird s eye|wide shot|portrait)\b/i.test(meta.title) ||
    meta.keywords.some((keyword) => /(airport|radio|number|stock image|commercial use)/i.test(keyword)) ||
    meta.category === "Animals" ||
    (meta.keyword_count ?? meta.keywords.length) < 20
  );
}

async function main(): Promise<void> {
  moveJsonReportIfPresent(LEGACY_REPORT_PATH, REPORT_PATH);
  const folder = path.join(DOWNLOADS_DIR, "upscaled", TARGET_DATE);
  const report = {
    started_at: jsonTimestamp(),
    target_date: TARGET_DATE,
    repaired: 0,
    skipped: 0,
    errors: [] as string[],
  };

  if (!fs.existsSync(folder)) {
    throw new Error(`Upscaled folder not found: ${folder}`);
  }

  for (const filePath of listSidecarFiles(folder)) {
    const entryName = path.basename(filePath);
    try {
      const sidecar = readJson<Sidecar>(filePath, {});
      if (!shouldRepair(sidecar)) {
        report.skipped += 1;
        continue;
      }

      const prompt = sidecar.generation_context?.prompt_used ?? "";
      const trendCategory = sidecar.trend_category ?? "";
      const trendTopic = sidecar.trend_topic ?? "";
      const visualKeywords = sidecar.generation_context?.visual_keywords_from_trend ?? [];
      const commercial = sidecar.generation_context?.commercial_use_cases ?? [];
      const { title, keywords, category } = buildPromptMetadataSeed({
        trendTopic,
        trendCategory,
        prompt,
        visualKeywords,
        commercialUseCases: commercial,
        seriesSlot: String((sidecar as Record<string, unknown>).series_slot ?? ""),
      });

      sidecar.adobe_stock_metadata = {
        ...sidecar.adobe_stock_metadata,
        title,
        title_char_count: title.length,
        keywords,
        keyword_count: keywords.length,
        category,
      };

      writeJson(filePath, sidecar);
      report.repaired += 1;
    } catch (error) {
      report.errors.push(`${entryName}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  writeJson(REPORT_PATH, { ...report, ended_at: jsonTimestamp() });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
