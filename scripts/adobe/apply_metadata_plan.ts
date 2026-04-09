import { IMAGE_REGISTRY_PATH } from "../project_paths";
import { jsonTimestamp } from "../common/time";
import type {
  AdobeMetadata,
  MatchResult,
  MetadataPlan,
  PanelState,
  RegistryEntry,
  RegistryFile,
} from "./apply_metadata_types";
import {
  CHECK_ONLY,
  readJson,
  writeJson,
  windowsRelative,
  normalizeNameKey,
  isReadyPipelineSidecar,
  buildApplyFields,
  hasApplyWork,
  buildCurrentPanelMetadata,
  buildFallbackMetadata,
  persistPreparedSidecar,
  metadataProblems,
} from "./apply_metadata_logic";

function normalizeRegistry(registry: RegistryFile | Record<string, RegistryEntry>): RegistryFile {
  if ("images" in registry && typeof registry.images === "object") {
    return {
      last_updated: (registry as RegistryFile).last_updated ?? undefined,
      total_images: (registry as RegistryFile).total_images ?? Object.keys((registry as RegistryFile).images ?? {}).length,
      images: { ...((registry as RegistryFile).images ?? {}) },
    };
  }
  return {
    last_updated: undefined,
    total_images: Object.keys(registry).length,
    images: { ...(registry as Record<string, RegistryEntry>) },
  };
}

export function upsertRegistry(originalName: string, match: MatchResult, sourceType: "pipeline" | "outside_system"): void {
  const registry = normalizeRegistry(readJson<RegistryFile | Record<string, RegistryEntry>>(IMAGE_REGISTRY_PATH, { images: {} }));
  const images = registry.images ?? {};
  let targetKey: string | null = null;
  for (const [key, entry] of Object.entries(images)) {
    const combined = [entry.image_file, entry.final_name, entry.original_name, entry.upscaled_path, entry.metadata_sidecar]
      .filter(Boolean).join(" ").toLowerCase();
    if (combined.includes(normalizeNameKey(originalName))) { targetKey = key; break; }
  }
  const now = jsonTimestamp();
  if (!targetKey) {
    targetKey = originalName;
    images[targetKey] = {
      source: sourceType === "outside_system" ? "outside_system" : (match.sidecar.source ?? "ai_generated"),
      final_name: originalName, original_name: originalName, source_path: null,
      dimensions: null, long_side: null, assigned_scale: "external",
      metadata_sidecar: match.sidecarPath ? windowsRelative(match.sidecarPath) : null,
      upscaled: false, upscaled_path: match.imagePath ? windowsRelative(match.imagePath) : null,
      upscaled_dimensions: null, registered_at: now, upscaled_at: null,
      adobe_stock_status: "ready_for_manual_review", adobe_apply_status: "applied",
      adobe_applied_at: now, adobe_only: sourceType === "outside_system",
    };
  } else {
    const entry = images[targetKey];
    entry.metadata_sidecar = match.sidecarPath ? windowsRelative(match.sidecarPath) : entry.metadata_sidecar ?? null;
    if (match.imagePath) entry.upscaled_path = windowsRelative(match.imagePath);
    entry.adobe_apply_status = "applied";
    entry.adobe_applied_at = now;
    entry.adobe_stock_status = entry.adobe_stock_status ?? "ready_for_manual_review";
  }
  registry.images = images;
  registry.total_images = Object.keys(images).length;
  registry.last_updated = now;
  writeJson(IMAGE_REGISTRY_PATH, registry);
}

export function prepareMetadataPlan(originalName: string, match: MatchResult, panelState: PanelState): MetadataPlan {
  const pipelineReady = isReadyPipelineSidecar(match.sidecar);
  if (pipelineReady) {
    const desiredMetadata = match.sidecar.adobe_stock_metadata ?? {};
    const applyFields = buildApplyFields(desiredMetadata, panelState);
    return {
      match, desiredMetadata,
      action: hasApplyWork(applyFields) ? "update_from_sidecar" : "checked_only",
      sourceType: "pipeline",
      reason: hasApplyWork(applyFields) ? "panel_differs_from_sidecar_or_adobe_only_fields" : "panel_already_matches_sidecar",
      needsApply: hasApplyWork(applyFields), applyFields,
    };
  }
  const currentMetadata = buildCurrentPanelMetadata(panelState);
  const currentProblems = metadataProblems(currentMetadata, panelState);
  if (currentProblems.length === 0) {
    const persisted = CHECK_ONLY ? match : persistPreparedSidecar(originalName, match, currentMetadata, match.sidecar.source ?? "outside_system");
    return {
      match: persisted, desiredMetadata: currentMetadata, action: "rebuilt_from_current",
      sourceType: "outside_system", reason: "strong_existing_adobe_metadata_captured_into_sidecar",
      needsApply: false, applyFields: buildApplyFields(currentMetadata, panelState),
    };
  }
  const fallbackMetadata = buildFallbackMetadata(panelState, match.sidecar);
  const persisted = CHECK_ONLY ? match : persistPreparedSidecar(originalName, match, fallbackMetadata, match.sidecar.source ?? "outside_system");
  return {
    match: persisted, desiredMetadata: fallbackMetadata, action: "rebuilt_from_fallback",
    sourceType: "outside_system", reason: `weak_existing_metadata:${currentProblems.join(",")}`,
    needsApply: true, applyFields: buildApplyFields(fallbackMetadata, panelState),
  };
}
