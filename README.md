# Adobe Stock Automation

This project is a three-stage Adobe Stock production pipeline built around Google Flow image generation, Upscayl-based upscaling, and Adobe Stock metadata application.

## What This Project Does

1. Researches commercially promising stock trends and turns them into structured image prompt series.
2. Generates and downloads images from Google Flow with sidecar metadata for every successful image.
3. Normalizes, registers, and upscales downloaded images to a 4K-ready output set.
4. Applies the prepared metadata to Adobe Stock upload items so the final review can be done quickly.

## Main Workflow

- `instructions/01_TREND_RESEARCH_AND_IMAGE_CREATION.md`
  Creates trend batches, submits prompts, downloads completed renders, and writes `.metadata.json` sidecars.
- `instructions/02_IMAGE_UPSCALER.md`
  Scans all downloaded images, repairs missing sidecars, updates `image_registry.json`, and upscales images with Upscayl.
- `instructions/03_METADATA_OPTIMIZER.md`
  Loads sidecar metadata and applies it to Adobe Stock upload rows.

## Key Runtime Folders

- `instructions/`
  The three system playbooks plus the stock success report.
- `scripts/`
  Runnable automation workers, shared path helpers, and Adobe Stock helper scripts.
- `data/`
  Runtime JSON state, registries, selector caches, and session handoff files.
- `downloads/`
  Source images, manual imports, and final upscaled exports.
- `staging/`
  Temporary upscale buckets used by the cleaned 02 pipeline.
- `logs/`
  Shared runtime log plus screenshot evidence when needed.

## Important State Files

- `data/session_state.json`
  Current workflow checkpoint across stages.
- `data/image_registry.json`
  Master image index for AI and manual assets.
- `data/upscaler_state.json`
  Upscayl CLI/GUI configuration and processing defaults.
- `data/descriptions.json`
  Generated prompt inventory for the current trend session.
- `data/trend_data.json`
  Ranked trend research output.

## External Dependency

Browser automation depends on:

`C:\Users\11\browser-automation-core\`

This provides the shared launcher, browser connection helpers, and selector-cache pattern used by the Flow and Adobe Stock steps.

## Operational Rules

- Every downloaded image must have exactly one matching `.metadata.json` sidecar.
- File 01 treats policy violations as prompt rewrites, not account-limit failures.
- File 01 downloads completed renders opportunistically and does not wait for a full batch to finish before continuing submission.
- File 02 prefers `2K` downloads from Flow and only falls back to `1X` after two failed `2K` attempts for the same image.
- File 02 must reconcile manual images dropped into `downloads/manual/` before upscaling.

## Current Layout

The project now uses the cleaned structure directly: workflow docs in `instructions/`, runnable code in `scripts/`, temporary upscale batches in `staging/`, and a single consolidated runtime log at `logs/automation.log`.
