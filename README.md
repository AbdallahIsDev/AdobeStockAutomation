# Adobe Stock Automation

This project is a four-stage Adobe Stock production pipeline built around trend research, Google Flow image generation, Upscayl-based upscaling, and Adobe Stock metadata application.

## What This Project Does

1. Researches commercially promising stock trends and ranks them for execution.
2. Generates and downloads image series from Google Flow with sidecar metadata for every successful image.
3. Normalizes, registers, and upscales downloaded images to a 4K-ready output set, with FIFO post-download prepare as the default and batch mode available for standalone upscale runs.
4. Applies the prepared metadata to Adobe Stock upload items so the final review can be done quickly.

## Main Workflow

- `SKILL.md`
  Main entry skill that routes the agent to the correct execution file(s).
- `instructions/01_TREND_RESEARCH.md`
  Runs the orchestrator boot, static cache check, dynamic research, and trend scoring.
- `instructions/02_IMAGE_CREATION.md`
  Builds the 8-slot prompt series, drives Google Flow, downloads renders, and writes `.metadata.json` sidecars.
- `instructions/03_IMAGE_UPSCALER.md`
  Scans all downloaded images, generates full metadata for manual images during the scan phase, updates `image_registry.json`, and upscales images with Upscayl.
- `instructions/04_METADATA_OPTIMIZER.md`
  Loads sidecar metadata and applies it to Adobe Stock upload rows, with a fallback rebuild path only for outside-system uploads.
- `instructions/STOCK_SUCCESS_REPORT.md`
  Strategic commercial reference used by the execution files through targeted chapter reads.

## Folder Structure

```text
PROJECT_ROOT\
│
├── SKILL.md                            ← Main execution entrypoint
│
├── instructions\                       ← Workflow definitions and system rules
│   ├── 01_TREND_RESEARCH.md
│   ├── 02_IMAGE_CREATION.md
│   ├── 03_IMAGE_UPSCALER.md
│   ├── 04_METADATA_OPTIMIZER.md
│   └── STOCK_SUCCESS_REPORT.md         ← Read first and load into memory
│
├── scripts\                            ← Public entrypoints and shared helpers
│   ├── flow_runtime.ts                 ← Public Flow runtime entrypoint
│   ├── session_runtime.ps1             ← Public session/bootstrap entrypoint
│   ├── upscale_runtime.ps1             ← Public upscale entrypoint
│   ├── process_adobe_page.ps1
│   ├── project_paths.ts
│   ├── common\                         ← Shared runtime helpers
│   │   └── failed_assets.ts
│   ├── flow\                           ← Internal Flow workers
│   │   ├── flow_batch_submit_worker.ts
│   │   ├── flow_download_worker.ts
│   │   ├── flow_nonblocking_download_worker.ts
│   │   ├── flow_probe.ts
│   │   └── flow_wait_for_new_renders.ts
│   ├── session\                        ← Internal session helpers
│   │   ├── bootstrap_runtime_state.ps1
│   │   ├── set_session_mode.ps1
│   │   ├── start_full_system_session.ps1
│   │   └── start_stage_session.ps1
│   └── upscale\                        ← Internal upscale workers
│       ├── reconcile_data_and_sidecars.ts
│       └── run_pipeline.ts
│
├── downloads\                          ← Source images and final prepared outputs
│   ├── [YYYY-MM-DD]\                   ← AI-generated images + `.metadata.json` sidecars
│   ├── failed\                         ← Failed assets grouped by date and asset name
│   ├── manual\                         ← Manually added source images
│   └── upscaled\                       ← Final prepared output set
│
├── staging\                            ← Temporary upscale buckets
│   ├── x2\
│   ├── x3\
│   ├── x4\
│   └── copy_only\
│
├── data\                               ← Runtime state, registries, and caches
│   ├── accounts.json
│   ├── adobe_stock_selectors.json
│   ├── descriptions.json
│   ├── dynamic_trend_cache.json
│   ├── image_registry.json
│   ├── selectors_registry.json
│   ├── session_state.json
│   ├── static_knowledge_cache.json
│   ├── trend_data.json
│   └── upscaler_state.json
│
├── logs\
│   ├── automation.log                  ← Shared runtime + Upscayl log
│   └── screenshots\                    ← Targeted browser evidence captures
│
└── depends on C:\Users\11\browser-automation-core\
    ├── launch_browser.bat
    ├── launch_browser.ps1
    ├── browser_core.ts
    └── selector_store.ts
```

## Key Runtime Folders

- `instructions/`
  The four execution playbooks and the stock success report.
- `scripts/`
  Runnable automation workers, the single public Flow entrypoint, shared path helpers, Adobe Stock helper scripts, the runtime JSON bootstrap script, and command wrappers for session mode and FIFO/batch upscale.
- `scripts/common/`
  Shared helpers used across multiple stages, including failed-asset quarantine.
- `scripts/session_runtime.ps1`
  Unified public entrypoint for bootstrap, full-system session setup, and stage-only session setup.
- `scripts/upscale_runtime.ps1`
  Unified public entrypoint for FIFO single-image prepare and batch upscale runs.
- `scripts/flow/`
  Internal Flow worker implementations grouped behind `scripts/flow_runtime.ts` so the root scripts folder stays cleaner.
- `scripts/session/`
  Internal session/bootstrap helpers grouped behind `scripts/session_runtime.ps1`.
- `scripts/upscale/`
  Internal upscale/reconcile implementations grouped behind `scripts/upscale_runtime.ps1`.
- `data/`
  Runtime JSON state, registries, selector caches, and session handoff files.
- `downloads/`
  Source images, manual imports, failed-asset quarantine, and final upscaled exports.
- `staging/`
  Temporary upscale buckets used by the cleaned 02 pipeline.
- `logs/`
  Shared runtime log for automation and Upscayl output, plus screenshot evidence when needed.

## Important State Files

- `scripts/session_runtime.ps1`
  Runs bootstrap, full-system session setup, or stage-only session setup from one command surface.
- `scripts/upscale_runtime.ps1`
  Runs FIFO single-image prepare or the normal batch upscale pass from one command surface.
- `scripts/flow_runtime.ts`
  Unified public entrypoint for Flow probe, submit, download, non-blocking download, and render-wait actions.
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
- Manual images must receive complete metadata during File 03 before they are allowed to upscale.
- File 02 treats policy violations as prompt rewrites, not account-limit failures.
- File 02 downloads completed renders opportunistically and does not wait for a full batch to finish before continuing submission.
- File 02 uses FIFO post-download prepare by default: download -> sidecar -> queue upscale -> continue immediately.
- Batch upscale remains available as a standalone recovery/cleanup path when explicitly invoked.
- File 03 prefers `2K` downloads from Flow and only falls back to `1X` after two failed `2K` attempts for the same image.
- File 03 must reconcile manual images dropped into `downloads/manual/`, generate their full metadata, and only then upscale them.
- Failed-asset `.failure.json` files are auto-created by the Flow and Upscale runtime commands; they are not written manually in the markdown instructions.

## Current Layout

The project now uses the split execution structure directly: `SKILL.md` as the main entry, workflow docs in `instructions/`, runnable code in `scripts/`, temporary upscale batches in `staging/`, and a single consolidated runtime log at `logs/automation.log`.
