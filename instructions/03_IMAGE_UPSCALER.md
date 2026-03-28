# 03_IMAGE_UPSCALER.md
## Adobe Stock Automation System · Execution File 3

---

## PURPOSE

Normalize every image in `downloads\`, keep the registry accurate, create missing manual-image stubs, and upscale everything possible to a 4K-ready output set.

This file supports two execution modes:

- `batch` mode for normal stage-only runs
- `fifo` mode for full-system runs where each newly downloaded image is prepared immediately

---

## SUCCESS REPORT PREREQUISITE

This file assumes `SKILL.md` already forced a full read of:

`PROJECT_ROOT\instructions\STOCK_SUCCESS_REPORT.md`

The full report must be loaded into active memory before this file runs.

---

## REQUIRED FILES

```text
PROJECT_ROOT\data\image_registry.json
PROJECT_ROOT\data\upscaler_state.json
PROJECT_ROOT\data\upscaler_session_state.json
PROJECT_ROOT\downloads\
PROJECT_ROOT\staging\
PROJECT_ROOT\logs\automation.log
C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe
```

Write the Upscayl CLI/app output into the same shared `PROJECT_ROOT\logs\automation.log` file.

Command-first entry:

```text
Stage-only batch run: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action batch
FIFO one-image run:   powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action fifo -ImagePath "[saved_path]"
```

---

## INPUT TYPES

### AI-generated images

- arrive from `02_IMAGE_CREATION.md`
- should already be named correctly
- should already have `.metadata.json` sidecars
- usually need 2x upscale

### Manual images

- may arrive with arbitrary names
- may have no sidecar
- must be renamed, registered, and stubbed before upscaling

---

## NAMING RULES

Use these conventions:

- AI-generated: `[topic]_[slot]_L[N]_[seq]_[date].ext`
- manual: `manual_[slug]_M[seq]_[date].ext`

If a manual image does not match the convention, rename it before registering it.

---

## REGISTRY AND SIDECAR PARITY

Before any upscale work:

1. load or create `image_registry.json`
2. scan `downloads\` recursively
3. exclude:
   - `downloads\upscaled\`
   - `staging\`
   - non-image files
4. for each image:
   - register it if missing
   - ensure exactly one matching `.metadata.json` exists
5. log orphan sidecars for review
6. do not continue until image/sidecar parity is restored

Registry fields to maintain:

```json
{
  "final_name": "manual_example_M001_20260328.png",
  "source": "manual",
  "source_path": "downloads\\manual\\manual_example_M001_20260328.png",
  "dimensions": { "width": 1920, "height": 1080 },
  "long_side": 1920,
  "assigned_scale": 2,
  "metadata_sidecar": "downloads\\manual\\manual_example_M001_20260328.metadata.json",
  "upscaled": false,
  "upscaled_path": null,
  "upscaled_dimensions": null,
  "adobe_stock_status": "not_uploaded"
}
```

---

## SCALE ASSIGNMENT

Assign upscale groups by `long_side`:

```text
>= 3840   -> copy_only
1921-3839 -> x2
1281-1920 -> x3
640-1280  -> x4
< 640     -> x4 + quality_flag=review_before_upload
```

Rules:

- `copy_only` files are copied, not upscaled
- low-resolution images still run through x4, but must be flagged for manual review

---

## MANUAL SIDECAR STUBS

If a manual image has no sidecar, create one immediately.

Minimum stub contract:

```json
{
  "source_image": "downloads\\manual\\manual_example_M001_20260328.png",
  "status": "stub_created_pending_review",
  "adobe_stock_metadata": {
    "title": "[NEEDS MANUAL REVIEW - set by file 04_METADATA_OPTIMIZER.md]",
    "keywords": [],
    "category": "[NEEDS MANUAL REVIEW - set by file 04_METADATA_OPTIMIZER.md]",
    "file_type": "Photos",
    "ai_generated": false,
    "people_or_property_fictional": false
  }
}
```

Do not invent strong metadata for manual files here. Only provide structure plus known facts.

---

## UPSCALER METHOD SELECTION

Primary method: CLI.

Check in this order:

1. `C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe`
2. any compatible binary inside `C:\Program Files\Upscayl\resources\bin\`

If a working CLI binary exists:

- save its path to `upscaler_state.json`
- use CLI mode

If CLI is unavailable:

- fall back to GUI automation
- log the fallback clearly

---

## CLI EXECUTION

Preferred command shape:

```powershell
& "C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe" `
  -i "[input_folder]" `
  -o "[output_folder]" `
  -s [scale_factor] `
  -n "[model_name]" `
  -f png
```

Model discovery rule:

- inspect `C:\Program Files\Upscayl\resources\models\`
- use the UltraSharp model name that matches the installed files
- cache the discovered model name in `upscaler_state.json`

Batch order:

1. `copy_only`
2. `x2`
3. `x3`
4. `x4`

For each batch:

1. create the staging folder
2. copy only the batch's images plus their sidecars
3. run the CLI once for the whole folder
4. verify output count
5. update registry entries with `upscaled_path` and dimensions

FIFO mode:

- command shape: `powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action fifo -ImagePath "[saved_path]"`
- process only the newly downloaded image
- copy its sidecar to the upscaled output
- mark the registry entry `ready_for_metadata_apply`
- return immediately so image creation can continue

---

## GUI FALLBACK

Use GUI automation only if CLI is not available.

Fallback rules:

- open Upscayl
- point it to the current staging folder
- set the same scale/model settings as the CLI batch
- verify output folder before moving to the next batch
- log the batch result the same way as CLI mode

---

## OUTPUTS AND HANDOFF

Primary output folder:

```text
PROJECT_ROOT\downloads\upscaled\[YYYY-MM-DD]\
```

Update:

- `image_registry.json`
- `upscaler_state.json`
- `upscaler_session_state.json`

Every final output image must still have its matching sidecar next to it.

Handoff:

```text
Next execution file: 04_METADATA_OPTIMIZER.md
```

---

## SUCCESS CRITERIA

This file is complete when:

- every input image is registered
- every image has exactly one sidecar
- all possible images are copied or upscaled into `downloads\upscaled\`
- registry entries point to the final output
- manual-image stubs exist where required
