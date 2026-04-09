# Adobe Stock Automation

This project is a four-stage Adobe Stock production pipeline built around trend research, Google Flow image generation, Upscayl-based upscaling, pre-upload XMP embedding, and Adobe Stock metadata application.

Metadata rule:

- never generate Adobe metadata from the downloaded filename alone
- AI image sidecars must come from prompt + trend context at download time
- AI image sidecars live in each date folder's `metadata\` subfolder, not beside the image file
- manual images must stay blocked until visual analysis generates their metadata
- File 04 always starts with a check pass before any Adobe write
- Adobe-stage fallback may check, add, edit, replace, erase, or improve weak metadata for outside-system uploads

## State Protection

- GitHub is the restore source for tracked project files such as `scripts/`, `instructions/`, `README.md`, and `SKILL.md`.
- Local backups are focused on the non-Git runtime state that would otherwise be lost: `data/`, `logs/`, and `staging/`.
- `downloads/` is intentionally excluded from project backups because it is the heaviest folder and the image files themselves already live there as the source of truth.
- Use `powershell -ExecutionPolicy Bypass -File scripts\session_runtime.ps1 -Action backup` to create a local-state snapshot before risky experiments.
- Use `powershell -ExecutionPolicy Bypass -File scripts\session_runtime.ps1 -Action reconcile` to rebuild runtime JSON from disk if the state folder is missing or damaged.
- Use `npx --yes tsx scripts\session\migrate_metadata_layout.ts` for the one-time sidecar move into each date folder's `metadata\` subfolder when normalizing older library dates.

## What This Project Does

1. Researches commercially promising stock trends and ranks them for execution.
2. Generates and downloads image series from Google Flow with sidecar metadata for every successful image, stored under each date folder's `metadata\` subfolder.
3. Normalizes, registers, upscales, and embeds XMP metadata into the final image before upload, with FIFO post-download prepare as the default and 16-image batch chunks for standalone upscale runs.
4. Verifies the prefilled Adobe metadata, then applies only the Adobe-only finish fields or any truly mismatched fields so the final review can be done quickly.

## Main Workflow

- `SKILL.md`
  Main entry skill that routes the agent to the correct execution file(s).
- `instructions/01_TREND_RESEARCH.md`
  Runs the orchestrator boot, static cache check, dynamic research, and trend scoring.
- `instructions/02_IMAGE_CREATION.md`
  Builds the 8-slot prompt series, drives Google Flow, downloads renders, and writes prompt-context `.metadata.json` sidecars for AI images into `downloads\[date]\metadata\`.
- `instructions/03_IMAGE_UPSCALER.md`
  Scans all downloaded images, generates full metadata for manual images during the scan phase, updates `image_registry.json`, upscales images with Upscayl, and embeds XMP metadata into the final files before upload.
- `instructions/04_METADATA_OPTIMIZER.md`
  Verifies the XMP-prefilled Adobe fields, applies Adobe-only finish fields, and only rewrites title/keywords when the current item is truly weak or mismatched.
- `instructions/STOCK_SUCCESS_REPORT.md`
  Strategic commercial reference that must be loaded into memory before the stage files run.

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
│   ├── adobe_runtime.ts                ← Public Adobe metadata/runtime entrypoint
│   ├── embed_metadata.ts               ← Public XMP embed helper used after upscale
│   ├── project_paths.ts
│   ├── common\                         ← Shared runtime helpers
│   │   ├── ai_metadata.ts
│   │   ├── failed_assets.ts
│   │   ├── logging.ts
│   │   ├── sidecars.ts
│   │   └── time.ts
│   ├── flow\                           ← Internal Flow workers
│   │   ├── flow_batch_submit_worker.ts
│   │   ├── flow_download_worker.ts
│   │   ├── flow_nonblocking_download_worker.ts
│   │   ├── flow_probe.ts
│   │   ├── flow_recover_failures.ts
│   │   └── flow_wait_for_new_renders.ts
│   ├── session\                        ← Internal session helpers
│   │   ├── bootstrap_runtime_state.ps1
│   │   ├── migrate_metadata_layout.ts
│   │   ├── set_session_mode.ps1
│   │   ├── start_full_system_session.ps1
│   │   └── start_stage_session.ps1
│   └── upscale\                        ← Internal upscale workers
│       ├── reconcile_data_and_sidecars.ts
│       └── run_pipeline.ts
│   └── adobe\                          ← Internal Adobe helpers
│       ├── adobe_selectors.ts          ← Selector cache + discovery for Adobe Stock
│       ├── adobe_skill.ts              ← Browser automation: connect, metadata, probe, submit
│       ├── apply_metadata.ts           ← Batch metadata apply/check across pages
│       ├── probe_uploads.ts            ← Upload queue inspection
│       └── repair_sidecars.ts          ← Sidecar file repair and normalization
│
├── downloads\                          ← Source images and final prepared outputs
│   ├── [YYYY-MM-DD]\                   ← AI-generated images only
│   │   └── metadata\                   ← `.metadata.json` sidecars for that date folder
│   ├── failed\                         ← Failed assets grouped by date and asset name
│   ├── manual\                         ← Manually added source images
│   │   └── metadata\                   ← Sidecars for manual images once File 03 analyzes them
│   └── upscaled\                       ← Final prepared output set
│       ├── [YYYY-MM-DD]\               ← Upscaled images only
│       │   └── metadata\               ← Final sidecars for that upscaled date folder
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
│   ├── adobe_outside_system\          ← Sidecars captured from Adobe-only uploads
│   ├── descriptions.json
│   ├── dynamic_trend_cache.json
│   ├── image_registry.json
│   ├── reports\                       ← Machine-readable JSON reports and probes
│   ├── selectors_registry.json
│   ├── session_state.json
│   ├── static_knowledge_cache.json
│   ├── trend_data.json
│   └── upscaler_state.json
│
├── logs\
│   ├── automation.log                  ← Shared runtime + Upscayl text log with severity tags
│   └── screenshots\                    ← Targeted browser evidence captures
│
├── project_backups\                    ← Local-state snapshots for gitignored runtime folders
│   └── .gitkeep
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
- `scripts/session_runtime.ps1 -Action backup`
  Creates a local-state snapshot for gitignored runtime folders without copying the heavy `downloads/` tree.
- `scripts/session_runtime.ps1 -Action reconcile`
  Restores runtime JSON from backup data when supplied and syncs registry/session state from the actual files on disk.
- `scripts/upscale_runtime.ps1`
  Unified public entrypoint for FIFO single-image prepare and batch upscale runs.
- `scripts/flow/`
  Internal Flow worker implementations grouped behind `scripts/flow_runtime.ts` so the root scripts folder stays cleaner.
- `scripts/session/`
  Internal session/bootstrap helpers grouped behind `scripts/session_runtime.ps1`.
- `scripts/upscale/`
  Internal upscale/reconcile implementations grouped behind `scripts/upscale_runtime.ps1`.
- `data/`
  Runtime JSON state, registries, selector caches, session handoff files, and machine-readable report JSON.
- `downloads/`
  Source images, manual imports, failed-asset quarantine, and final upscaled exports.
- `staging/`
  Temporary upscale buckets used by the cleaned 02 pipeline.
- `logs/`
  Shared runtime text log for automation and Upscayl output, plus screenshot evidence when needed.
- `project_backups/`
  Local snapshots focused on gitignored runtime state that GitHub cannot restore for you.

## Important State Files

- `scripts/session_runtime.ps1`
  Runs bootstrap, full-system session setup, or stage-only session setup from one command surface.
- `scripts/session_runtime.ps1 -Action build-descriptions`
  Builds the dynamic prompt inventory from `trend_data.json`, applies the 64-image session cap, and carries extra trends forward to the next run.
  This is a session-start step and should not be rerun after a live generation session has already started.
  It also refuses stale `trend_data.json`; restored or older trend output must not be reused silently for a new session.
- `scripts/upscale_runtime.ps1`
  Runs FIFO single-image prepare or the normal batch upscale pass from one command surface.
- `scripts/flow_runtime.ts`
  Unified public entrypoint for Flow probe, submit, full File 02 session-loop control, default parallel download, recovery download, visible-failure recovery, and render-wait actions.
- `data/session_state.json`
  Current workflow checkpoint across stages.
- `data/image_registry.json`
  Master image index for AI and manual assets.
- `data/upscaler_state.json`
  Upscayl CLI/GUI configuration and processing defaults.
- `data/descriptions.json`
  Dynamically generated prompt inventory for the current session plus any deferred trends for the next one.
- `data/trend_data.json`
  Ranked trend research output.

## External Dependency

Browser automation depends on:

`C:\Users\11\browser-automation-core\`

This provides the shared launcher, browser connection helpers, and selector-cache pattern used by the Flow and Adobe Stock steps.

XMP embedding depends on:

`ExifTool`

If ExifTool is installed outside PATH, set `data\upscaler_state.json -> exiftool_path`.

## Operational Rules

- Every downloaded image must have exactly one matching `.metadata.json` sidecar in the sibling `metadata\` subfolder for that date folder.
- Manual images must receive complete metadata during File 03 before they are allowed to upscale.
- File 02 treats policy violations as prompt rewrites, not account-limit failures.
- File 02 downloads completed renders opportunistically and does not wait for a full batch to finish before continuing submission.
- File 02 uses a per-session cap of 64 images total: 32 wide and 32 square.
- That 64-image limit is per session, not per day. Starting a new session later the same day should give a fresh 64-image budget.
- File 02 tracks one active session run baseline so old Flow project images stay ignored even when multiple new batches are in flight.
- File 02 must retry failed prompts instead of leaving successful sibling renders blocked behind incomplete batches.
- File 02 treats visible failed tiles, generic failed renders, and long-running unresolved renders as recoverable runtime failures; they must be retried or recovered instead of freezing the rolling loop.
- File 02 downloads successful sibling renders immediately even when other images from the same batch fail or time out.
- File 02 uses FIFO post-download prepare by default: download -> prompt-context sidecar -> queue upscale -> continue immediately.
- File 02 must never derive AI metadata from the downloaded filename or suggested filename.
- File 02 must keep `2K` requests bounded to 4 concurrent Flow upscale/download jobs per pass; do not flood Flow with more simultaneous `2K` requests than that.
- If Chrome saves a file into `C:\Users\11\Downloads` while Playwright `saveAs` fails, File 02 must recover that file into the project download folder instead of re-requesting the same media blindly.
- File 03 may create a missing AI sidecar shell only as a rebuild marker; it must not invent final metadata from the filename.
- File 02 builds `descriptions.json` dynamically from the actual ranked trend list; it must never assume a fixed total like 32 prompts.
- If the ranked trend list is shorter than the 64-image session budget, File 02 must extend it with additional loop variants of the strongest ranked trends instead of stopping early.
- File 02 queues at most 8 trends per session and stores overflow trends as carry-forward work for the next session.
- `npx --yes tsx scripts/flow_runtime.ts --action=download` is the default fully parallel downloader; `--action=download-recovery` is the slower recovery-only sweep.
- `npx --yes tsx scripts/flow_runtime.ts --action=run-session` is the preferred File 02 controller because it keeps the submit/download/retry/recovery loop running until the session cap or prompt exhaustion.
- `run-session` now enforces a single-controller lock so multiple agents cannot submit the same prompt range twice inside one live session.
- `run-session` may submit a partial recovery subset from an older 4-prompt group when only some prompt slots are missing after a drift cleanup pass.
- `npx --yes tsx scripts/flow_runtime.ts --action=recover-failures` is the scripted repair path for visible Flow failed tiles that escaped normal batch-state handling.
- `npx --yes tsx scripts/flow_runtime.ts --action=repair-sidecars` repairs missing AI `.metadata.json` sidecars for already-downloaded session images in the date folder's `metadata\` subfolder before the pipeline continues.
- `npx --yes tsx scripts/flow_runtime.ts --action=reconcile-downloads` cleans duplicate/download-spill drift, keeps one canonical file per prompt slot, and resets stranded prompt slots back to `ready` for a clean rerun.
- File 03 batch upscale is a sync/catch-up pass only for images not already marked `upscaled = true`.
- File 03 batch upscale runs in 16-image chunks so a full 64-image session resolves in four clean upscale batches.
- File 03 embeds XMP title, keywords, and description into every final upscaled image before upload.
- If ExifTool is not installed yet, File 03 records `xmp_embed_status = pending_exiftool_install` instead of pretending the embed succeeded.
- File 03 writes outputs into `downloads/upscaled/[source_download_date]`, so the upscaled folder matches the image's real source date.
- Batch upscale remains available as a standalone recovery/cleanup path when explicitly invoked.
- File 03 prefers `2K` downloads from Flow and only falls back to `1X` after two failed `2K` attempts for the same image.
- File 03 must reconcile manual images dropped into `downloads/manual/`, generate their full metadata, and only then upscale them.
- File 04 is a check-first finish stage: pipeline images should already arrive with title and keywords prefilled from embedded XMP.
- File 04 is still an editor for outside-system uploads: it may add, replace, erase, and improve Adobe fields when the current metadata is weak.
- File 04 has a real check phase: it audits the current Adobe fields first, then writes only the fields that are weak or mismatched.
- `npx --yes tsx scripts/adobe_runtime.ts --action=check --date=YYYY-MM-DD` runs a non-destructive Adobe audit pass.
- `npx --yes tsx scripts/adobe_runtime.ts --action=apply --date=YYYY-MM-DD` runs the normal check-then-update pass.
- Windows alternative (thin wrapper): `powershell -ExecutionPolicy Bypass -File scripts\session_runtime.ps1 -Action stage -Stage metadata_optimizer`
- Note: `adobe_stock_uia.ps1` and `process_adobe_page.ps1` have been removed. Browser automation is now handled by `scripts/adobe/adobe_skill.ts` using Playwright + Stagehand via browser-automation-core.
- Machine-readable JSON reports belong in `data\reports\`, not in `logs\`.
- `logs\automation.log` uses severity tags like `[ERROR]`, `[WARN]`, and `[SUCCESS]` instead of embedded color codes, because plain text colors are not reliable across editors.
- `logs\automation.log` automatically prunes lines older than 3 days whenever active runtime scripts append new entries.
- Failed-asset `.failure.json` files are auto-created by the Flow and Upscale runtime commands; they are not written manually in the markdown instructions.
- `bootstrap` is only for a truly fresh project with no historical runtime state; if `data/` is missing but `downloads/` or `logs/` already exist, use `session_runtime.ps1 -Action reconcile` instead of recreating empty JSON.
- `session_runtime.ps1 -Action stage -Stage trend_research` only initializes File 01 session state. It does not count as live trend research by itself.

## Current Layout

The project now uses the split execution structure directly: `SKILL.md` as the main entry, workflow docs in `instructions/`, runnable code in `scripts/`, temporary upscale batches in `staging/`, and a single consolidated runtime log at `logs/automation.log`.
