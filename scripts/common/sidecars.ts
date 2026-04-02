import fs from "node:fs";
import path from "node:path";

export const METADATA_DIRNAME = "metadata";

export function metadataDirForFolder(folderPath: string): string {
  return path.join(folderPath, METADATA_DIRNAME);
}

export function legacySiblingSidecarPath(imagePath: string): string {
  return path.join(path.dirname(imagePath), `${path.parse(imagePath).name}.metadata.json`);
}

export function sidecarPathForImage(imagePath: string): string {
  return path.join(metadataDirForFolder(path.dirname(imagePath)), `${path.parse(imagePath).name}.metadata.json`);
}

export function sidecarPathForImageName(folderPath: string, imageFileName: string): string {
  return path.join(metadataDirForFolder(folderPath), `${path.parse(imageFileName).name}.metadata.json`);
}

export function ensureMetadataDirForImage(imagePath: string): string {
  const metadataDir = metadataDirForFolder(path.dirname(imagePath));
  fs.mkdirSync(metadataDir, { recursive: true });
  return metadataDir;
}

export function resolveExistingSidecarPath(imagePath: string): string | null {
  const preferred = sidecarPathForImage(imagePath);
  if (fs.existsSync(preferred)) {
    return preferred;
  }
  const legacy = legacySiblingSidecarPath(imagePath);
  if (fs.existsSync(legacy)) {
    return legacy;
  }
  return null;
}

export function listSidecarFiles(folderPath: string): string[] {
  const metadataDir = metadataDirForFolder(folderPath);
  if (!fs.existsSync(metadataDir)) {
    return [];
  }
  return fs.readdirSync(metadataDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".metadata.json"))
    .map((entry) => path.join(metadataDir, entry.name));
}
