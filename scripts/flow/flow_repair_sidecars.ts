import fs from "node:fs";
import path from "node:path";
import { buildAiMetadataContext } from "../common/ai_metadata";
import { appendAutomationLog } from "../common/logging";
import { resolvePromptIdForDownload } from "../common/prompt_resolution";
import { SESSION_STATE_PATH } from "../project_paths";
import { jsonTimestamp } from "../common/time";

type DownloadedImage = {
  media_name?: string;
  prompt_id?: number | null;
  saved_path?: string;
  suggested_filename?: string;
  downloaded_at?: string | null;
};

type SessionState = {
  current_model?: string;
  downloaded_images?: DownloadedImage[];
  images_downloaded_count?: number;
};

function readJson<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function appendLog(message: string): void {
  appendAutomationLog(message);
}

function sidecarPathFor(imagePath: string): string {
  return path.join(path.dirname(imagePath), `${path.parse(imagePath).name}.metadata.json`);
}

function sortByDownloadedAt(a: DownloadedImage, b: DownloadedImage): number {
  const aKey = String(a.downloaded_at ?? "");
  const bKey = String(b.downloaded_at ?? "");
  if (aKey !== bKey) {
    return aKey.localeCompare(bKey);
  }
  return String(a.saved_path ?? "").localeCompare(String(b.saved_path ?? ""));
}

function main(): void {
  const session = readJson<SessionState>(SESSION_STATE_PATH, {});
  const downloadedImages = (Array.isArray(session.downloaded_images) ? session.downloaded_images : [])
    .map((item) => ({ ...item, prompt_id: null }));
  const workingSession: SessionState = {
    ...session,
    downloaded_images: [],
  };

  let repaired = 0;
  let skippedMissingImage = 0;
  let unresolved = 0;

  for (const item of [...downloadedImages].sort(sortByDownloadedAt)) {
    const savedPath = String(item.saved_path ?? "").trim();
    const mediaName = String(item.media_name ?? "").trim();
    if (!savedPath || !mediaName) {
      continue;
    }

    if (!fs.existsSync(savedPath)) {
      skippedMissingImage += 1;
      continue;
    }

    const sidecarPath = sidecarPathFor(savedPath);
    const promptId = resolvePromptIdForDownload(
      workingSession,
      mediaName,
      item.suggested_filename ?? path.basename(savedPath),
      {
        downloadedAt: item.downloaded_at ?? null,
        allowUsedPromptFallback: true,
      },
    );

    if (promptId == null) {
      unresolved += 1;
      appendLog(`AI sidecar repair could not resolve prompt_id for ${mediaName}.`);
      continue;
    }

    const payload = buildAiMetadataContext({
      imagePath: savedPath,
      mediaName,
      promptId,
      downloadedAt: item.downloaded_at ?? jsonTimestamp(),
      modelUsed: session.current_model ?? "Nano Banana 2 / Flow",
    });

    writeJson(sidecarPath, payload);
    item.prompt_id = promptId;
    workingSession.downloaded_images = [
      ...(workingSession.downloaded_images ?? []),
      item,
    ];
    repaired += 1;
    appendLog(`AI sidecar repaired for ${mediaName} using prompt ${promptId}.`);
  }

  session.downloaded_images = workingSession.downloaded_images;
  session.images_downloaded_count = workingSession.downloaded_images?.length ?? 0;
  writeJson(SESSION_STATE_PATH, session);
  appendLog(
    `Flow sidecar repair complete. repaired=${repaired}, missing_image=${skippedMissingImage}, unresolved=${unresolved}.`,
  );
}

main();
