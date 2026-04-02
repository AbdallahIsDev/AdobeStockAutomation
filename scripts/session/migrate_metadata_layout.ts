import fs from "node:fs";
import path from "node:path";
import {
  DOWNLOADS_DIR,
  IMAGE_REGISTRY_PATH,
  ROOT,
} from "../project_paths";
import {
  metadataDirForFolder,
  resolveExistingSidecarPath,
} from "../common/sidecars";
import { appendAutomationLog } from "../common/logging";
import { jsonTimestamp } from "../common/time";

type RegistryEntry = {
  source_path?: string | null;
  upscaled_path?: string | null;
  metadata_sidecar?: string | null;
};

type RegistryFile = {
  last_updated?: string | null;
  total_images?: number;
  images?: Record<string, RegistryEntry>;
};

const DATE_FOLDER_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function migrateFolder(folderPath: string): { moved: number } {
  const metadataDir = metadataDirForFolder(folderPath);
  fs.mkdirSync(metadataDir, { recursive: true });
  let moved = 0;
  for (const entry of fs.readdirSync(folderPath, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".metadata.json")) {
      continue;
    }
    const sourcePath = path.join(folderPath, entry.name);
    const destinationPath = path.join(metadataDir, entry.name);
    if (fs.existsSync(destinationPath)) {
      fs.rmSync(sourcePath, { force: true });
      continue;
    }
    fs.renameSync(sourcePath, destinationPath);
    moved += 1;
  }

  for (const entry of fs.readdirSync(metadataDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    const normalizedName = entry.name.replace(/\.(png|jpe?g|webp|tiff?)\.metadata\.json$/i, ".metadata.json");
    if (normalizedName === entry.name) {
      continue;
    }
    const sourcePath = path.join(metadataDir, entry.name);
    const destinationPath = path.join(metadataDir, normalizedName);
    if (fs.existsSync(destinationPath)) {
      fs.rmSync(sourcePath, { force: true });
      continue;
    }
    fs.renameSync(sourcePath, destinationPath);
  }

  return { moved };
}

function candidateImagePaths(entry: RegistryEntry): string[] {
  const candidates = [entry.upscaled_path, entry.source_path]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => path.join(ROOT, value.replaceAll("\\", path.sep)));
  return [...new Set(candidates)];
}

function fixRegistryPaths(): { updated: number } {
  const registry = readJson<RegistryFile>(IMAGE_REGISTRY_PATH, { images: {} });
  let updated = 0;
  for (const entry of Object.values(registry.images ?? {})) {
    let nextSidecarPath: string | null = null;

    for (const imagePath of candidateImagePaths(entry)) {
      const resolved = resolveExistingSidecarPath(imagePath);
      if (resolved) {
        nextSidecarPath = windowsRelative(resolved);
        break;
      }
    }

    if (nextSidecarPath && entry.metadata_sidecar !== nextSidecarPath) {
      entry.metadata_sidecar = nextSidecarPath;
      updated += 1;
    }
  }

  registry.last_updated = jsonTimestamp();
  registry.total_images = Object.keys(registry.images ?? {}).length;
  writeJson(IMAGE_REGISTRY_PATH, registry);
  return { updated };
}

function datedDownloadFolders(): string[] {
  const folders: string[] = [];
  for (const entry of fs.readdirSync(DOWNLOADS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name === "upscaled") {
      const upscaledRoot = path.join(DOWNLOADS_DIR, "upscaled");
      for (const upscaledEntry of fs.readdirSync(upscaledRoot, { withFileTypes: true })) {
        if (upscaledEntry.isDirectory() && DATE_FOLDER_RE.test(upscaledEntry.name)) {
          folders.push(path.join(upscaledRoot, upscaledEntry.name));
        }
      }
      continue;
    }
    if (entry.name === "manual") {
      folders.push(path.join(DOWNLOADS_DIR, "manual"));
      continue;
    }
    if (DATE_FOLDER_RE.test(entry.name)) {
      folders.push(path.join(DOWNLOADS_DIR, entry.name));
    }
  }
  return folders;
}

function main(): void {
  let moved = 0;
  let touchedFolders = 0;
  for (const folder of datedDownloadFolders()) {
    const result = migrateFolder(folder);
    moved += result.moved;
    touchedFolders += 1;
  }

  const registryResult = fixRegistryPaths();
  appendAutomationLog(
    `Metadata folder migration complete. folders=${touchedFolders}, sidecars_moved=${moved}, registry_updated=${registryResult.updated}.`,
    "SUCCESS",
  );
}

main();
