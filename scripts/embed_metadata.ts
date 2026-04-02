import fs from "node:fs";
import path from "node:path";
import { sidecarPathForImage } from "./common/sidecars";
import { execFileSync, spawnSync } from "node:child_process";
import { appendAutomationLog } from "./common/logging";
import { jsonTimestamp } from "./common/time";
import { ROOT, UPSCALER_STATE_PATH } from "./project_paths";

type AdobeStockMetadata = {
  title?: string;
  keywords?: string[];
  description?: string;
};

type Sidecar = {
  adobe_stock_metadata?: AdobeStockMetadata;
  generation_context?: {
    prompt_used?: string | null;
  };
  xmp_embed_status?: string;
  xmp_embedded_at?: string | null;
  xmp_embed_detail?: string | null;
  xmp_tool_path?: string | null;
};

type UpscalerState = {
  exiftool_path?: string | null;
};

export type XmpEmbedStatus =
  | "embedded"
  | "pending_exiftool_install"
  | "skipped_missing_sidecar"
  | "skipped_incomplete_metadata"
  | "failed";

export type XmpEmbedResult = {
  status: XmpEmbedStatus;
  embeddedAt: string | null;
  toolPath: string | null;
  detail: string;
  fieldsWritten: string[];
};

type CliArgs = {
  imagePath: string | null;
  sidecarPath: string | null;
};

function readArg(name: string): string | null {
  const arg = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!arg) {
    return null;
  }
  return arg.split("=", 2)[1]?.replace(/^"(.*)"$/, "$1") ?? null;
}

function parseArgs(): CliArgs {
  return {
    imagePath: readArg("image"),
    sidecarPath: readArg("sidecar"),
  };
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

function resolveExifToolPath(): string | null {
  const upscalerState = readJson<UpscalerState>(UPSCALER_STATE_PATH, {});
  const candidates = [
    process.env.EXIFTOOL_PATH ?? null,
    upscalerState.exiftool_path ?? null,
    "C:\\Program Files\\ExifTool\\exiftool.exe",
    "C:\\Program Files\\exiftool\\exiftool.exe",
    "C:\\ExifTool\\exiftool.exe",
    path.join(ROOT, "tools", "exiftool", "exiftool.exe"),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    const result = spawnSync("where.exe", ["exiftool"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    if (result.status === 0) {
      const first = (result.stdout ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      if (first && fs.existsSync(first)) {
        return first;
      }
    }
  } catch {
    // ignore where.exe failures
  }

  return null;
}

function buildDescription(sidecar: Sidecar, title: string): string {
  const prompt = sidecar.generation_context?.prompt_used?.trim();
  if (prompt) {
    return prompt.slice(0, 2000);
  }
  return title;
}

function updateSidecar(sidecarPath: string, mutate: (sidecar: Sidecar) => Sidecar): void {
  const sidecar = readJson<Sidecar>(sidecarPath, {});
  const updated = mutate(sidecar);
  writeJson(sidecarPath, updated);
}

export function embedXmpMetadata(imagePath: string, sidecarPath: string | null): XmpEmbedResult {
  if (!sidecarPath || !fs.existsSync(sidecarPath)) {
    return {
      status: "skipped_missing_sidecar",
      embeddedAt: null,
      toolPath: null,
      detail: "Sidecar not found beside the final image.",
      fieldsWritten: [],
    };
  }

  const sidecar = readJson<Sidecar>(sidecarPath, {});
  const title = sidecar.adobe_stock_metadata?.title?.trim() ?? "";
  const keywords = (sidecar.adobe_stock_metadata?.keywords ?? []).map((value) => value.trim()).filter(Boolean);
  const description = buildDescription(sidecar, title);

  if (!title || keywords.length < 5) {
    const result: XmpEmbedResult = {
      status: "skipped_incomplete_metadata",
      embeddedAt: null,
      toolPath: null,
      detail: "Sidecar metadata is incomplete for XMP embedding.",
      fieldsWritten: [],
    };
    updateSidecar(sidecarPath, (current) => ({
      ...current,
      xmp_embed_status: result.status,
      xmp_embedded_at: result.embeddedAt,
      xmp_embed_detail: result.detail,
      xmp_tool_path: result.toolPath,
    }));
    return result;
  }

  const exiftoolPath = resolveExifToolPath();
  if (!exiftoolPath) {
    const result: XmpEmbedResult = {
      status: "pending_exiftool_install",
      embeddedAt: null,
      toolPath: null,
      detail: "ExifTool is not installed or not discoverable on this machine.",
      fieldsWritten: [],
    };
    updateSidecar(sidecarPath, (current) => ({
      ...current,
      xmp_embed_status: result.status,
      xmp_embedded_at: result.embeddedAt,
      xmp_embed_detail: result.detail,
      xmp_tool_path: result.toolPath,
    }));
    return result;
  }

  const args = [
    "-overwrite_original",
    "-m",
    "-charset",
    "filename=UTF8",
    "-XMP-dc:Title=",
    `-XMP-dc:Title=${title}`,
    "-XMP-dc:Description=",
    `-XMP-dc:Description=${description}`,
    "-XMP-dc:Subject=",
    ...keywords.map((keyword) => `-XMP-dc:Subject+=${keyword}`),
    imagePath,
  ];

  try {
    execFileSync(exiftoolPath, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const embeddedAt = jsonTimestamp();
    const result: XmpEmbedResult = {
      status: "embedded",
      embeddedAt,
      toolPath: exiftoolPath,
      detail: "XMP title, keywords, and description written to the image file.",
      fieldsWritten: ["title", "keywords", "description"],
    };
    updateSidecar(sidecarPath, (current) => ({
      ...current,
      xmp_embed_status: result.status,
      xmp_embedded_at: embeddedAt,
      xmp_embed_detail: result.detail,
      xmp_tool_path: exiftoolPath,
    }));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result: XmpEmbedResult = {
      status: "failed",
      embeddedAt: null,
      toolPath: exiftoolPath,
      detail: message,
      fieldsWritten: [],
    };
    updateSidecar(sidecarPath, (current) => ({
      ...current,
      xmp_embed_status: result.status,
      xmp_embedded_at: result.embeddedAt,
      xmp_embed_detail: message,
      xmp_tool_path: exiftoolPath,
    }));
    return result;
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!args.imagePath) {
    throw new Error("Usage: --image=PATH [--sidecar=PATH]");
  }

  const imagePath = path.resolve(args.imagePath);
  const sidecarPath = args.sidecarPath
    ? path.resolve(args.sidecarPath)
    : sidecarPathForImage(imagePath);

  const result = embedXmpMetadata(imagePath, sidecarPath);
  const level =
    result.status === "embedded"
      ? "SUCCESS"
      : result.status === "pending_exiftool_install" || result.status === "skipped_missing_sidecar" || result.status === "skipped_incomplete_metadata"
        ? "WARN"
        : "ERROR";
  appendAutomationLog(`XMP embed ${result.status} for ${path.basename(imagePath)}. ${result.detail}`, level);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if ((process.argv[1] ?? "").toLowerCase().includes("embed_metadata")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
}
