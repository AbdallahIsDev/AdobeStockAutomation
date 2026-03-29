import fs from "node:fs";
import path from "node:path";
import { FAILED_DOWNLOADS_DIR, ROOT } from "../project_paths";

type FailedAssetOptions = {
  assetKey: string;
  reasonCode: string;
  reasonDetail?: string | null;
  relatedPaths?: Array<string | null | undefined>;
  timestamp?: string;
  extra?: Record<string, unknown>;
};

type FailedAssetResult = {
  folderPath: string;
  movedPaths: string[];
  markerPath: string;
};

function sanitizeAssetKey(value: string): string {
  return value
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "failed_asset";
}

function dateFolderName(): string {
  return new Date().toISOString().slice(0, 10);
}

function windowsRelative(filePath: string): string {
  return path.relative(ROOT, filePath).replaceAll("/", "\\");
}

function moveIntoFolder(sourcePath: string, targetFolder: string): string | null {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return null;
  }

  fs.mkdirSync(targetFolder, { recursive: true });
  const targetPath = path.join(targetFolder, path.basename(sourcePath));
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
  fs.renameSync(sourcePath, targetPath);
  return targetPath;
}

export function quarantineFailedAsset(options: FailedAssetOptions): FailedAssetResult {
  const folderPath = path.join(FAILED_DOWNLOADS_DIR, dateFolderName(), sanitizeAssetKey(options.assetKey));
  fs.mkdirSync(folderPath, { recursive: true });

  const movedPaths = (options.relatedPaths ?? [])
    .map((filePath) => (filePath ? moveIntoFolder(filePath, folderPath) : null))
    .filter((filePath): filePath is string => Boolean(filePath));

  const markerPath = path.join(folderPath, `${sanitizeAssetKey(options.assetKey)}.failure.json`);
  fs.writeFileSync(
    markerPath,
    `${JSON.stringify(
      {
        failed_at: options.timestamp ?? new Date().toISOString(),
        reason_code: options.reasonCode,
        reason_detail: options.reasonDetail ?? null,
        folder_path: windowsRelative(folderPath),
        related_files: movedPaths.map((filePath) => windowsRelative(filePath)),
        ...(options.extra ?? {}),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return {
    folderPath,
    movedPaths,
    markerPath,
  };
}
