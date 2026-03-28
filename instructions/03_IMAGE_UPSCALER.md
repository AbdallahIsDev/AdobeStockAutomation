# 03_IMAGE_UPSCALER.md
## Adobe Stock Automation System · Execution File 3

---

## PURPOSE

Normalize every image in `downloads\`, keep the registry accurate, create missing manual-image sidecars, and upscale everything possible to a 4K-ready output set.

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
PROJECT_ROOT\downloads\
PROJECT_ROOT\staging\
PROJECT_ROOT\logs\automation.log
C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe
```

Write Upscayl CLI/app output into the shared `PROJECT_ROOT\logs\automation.log` file.

Command-first entry:

```text
Stage-only batch run: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action batch
FIFO one-image run:   powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action fifo -ImagePath "[saved_path]"
```

---

## INPUT TYPES

### AI-generated images

- arrive from `02_IMAGE_CREATION.md`
- already named correctly and have `.metadata.json` sidecars
- usually need 2x upscale (long side ~2752px)
- if AI sidecar is missing: create a minimal stub immediately and log a warning — do not skip the image

### Manual images

- arrive with arbitrary names in `downloads\manual\`
- have no sidecar
- must be renamed, registered, and given a bootstrap sidecar before upscaling
- `04_METADATA_OPTIMIZER.md` later generates the full metadata automatically from visual analysis; the user does not fill manual metadata by hand

---

## NAMING RULES

```text
AI-generated: [topic]_[slot]_L[N]_[seq]_[date].ext
              example: ai_finance_16A_establishing_L1_001_20260323.png

Manual:       manual_[slug]_M[seq]_[date].ext
              example: manual_sunset_beach_M001_20260323.jpg
```

Manual slug generation: strip extension and common camera prefixes (DSC\_, IMG\_, DCIM\_), replace spaces and special chars with underscores, lowercase, truncate to 40 chars. If the result is meaningless (all numbers, too short), use `image` as the fallback slug. Count today's registered manual images to get the next `M[seq]` number (zero-padded to 3 digits, e.g. M001, M002).

---

## REGISTRY AND SIDECAR PARITY

Before any upscale work:

1. load or create `image_registry.json`
2. scan `downloads\` recursively; exclude `downloads\upscaled\`, `staging\`, and non-image files
3. for each image not in registry: register it and ensure exactly one `.metadata.json` sidecar exists
4. if AI image sidecar is missing: create a minimal bootstrap sidecar (mark `source: ai_generated`) and log a warning
5. log orphan sidecars (sidecars with no matching image) for manual review
6. do not proceed to upscaling until every image has exactly one sidecar

Registry fields to maintain per entry:

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
1921-3839 -> x2   (AI Flow images at ~2752px land here)
1281-1920 -> x3
640-1280  -> x4
< 640     -> x4 + quality_flag=review_before_upload
```

`copy_only` files are copied directly to the output folder without upscaling. Low-res images still run through x4 but must be flagged for manual review before upload.

---

## MANUAL SIDECAR BOOTSTRAP

If a manual image has no sidecar, create one immediately so the image can move through the same registry and upscale flow as AI-generated images.

This bootstrap sidecar is structural only. It is not a user task. `04_METADATA_OPTIMIZER.md` must later generate the real title, keywords, category, and disclosure fields automatically from the image itself, then apply that metadata to the matching Adobe Stock item.

```json
{
  "source_image": "downloads\\manual\\manual_example_M001_20260328.png",
  "status": "pending_auto_metadata_generation",
  "adobe_stock_metadata": {
    "title": "",
    "keywords": [],
    "category": "",
    "file_type": "Photos",
    "ai_generated": false,
    "people_or_property_fictional": false
  }
}
```

---

## UPSCALER METHOD SELECTION

Primary: CLI binary. Fallback: GUI automation.

Check for CLI in this order:

1. `C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe`
2. any compatible binary inside `C:\Program Files\Upscayl\resources\bin\`

If a working CLI binary is found, save its path to `upscaler_state.json` and use CLI mode. If CLI is unavailable, fall back to GUI and log the fallback clearly.

---

## CLI EXECUTION

```powershell
& "[cli_binary_path]" -i "[input_folder]" -o "[output_folder]" -s [scale_factor] -n "[model_name]" -f png
```

Model discovery (first run only): inspect `C:\Program Files\Upscayl\resources\models\`, find the UltraSharp model file, use filename without extension as the `-n` value. Cache in `upscaler_state.json`.

Output folder for all batches: `PROJECT_ROOT\downloads\upscaled\[YYYY-MM-DD]\`

Batch execution order:

1. `copy_only` — copy files and sidecars directly to the output folder (no CLI command needed)
2. `x2`
3. `x3`
4. `x4`

For each batch:

1. copy only the batch's images (plus their sidecars) into the staging subfolder (`staging\x2\` etc.)
2. run CLI once for the entire staging folder
3. verify output count matches input count; log any discrepancy
4. copy each sidecar to the output folder alongside its upscaled image
5. update registry: `upscaled=true`, `upscaled_path`, `upscaled_dimensions`, `upscaled_at`

After all batches: delete contents of `staging\x2\`, `staging\x3\`, `staging\x4\`, `staging\copy_only\`. Keep the empty folders.

**FIFO mode** (single image, called per-download during image creation):

- process only the single newly downloaded image
- assign its scale, copy to the appropriate staging subfolder
- run CLI just for that one image
- copy its sidecar to the output folder
- mark registry entry `ready_for_metadata_apply`
- return immediately so image creation can continue

---

## GUI FALLBACK

Use only when CLI binary is unavailable.

Critical GUI behaviors that differ from the CLI:

- **"Batch Upscayl" toggle is OFF by default every time the app opens.** Enable it before anything else. Confirm that the button label changes from "Select Image" to "Select Folder".
- **Output folder is NOT remembered between app launches.** Must be set every session. After clicking "Set Output Folder" and picking the output path, hover over the button — a tooltip must appear showing the selected path. If no tooltip appears, the folder was not saved; repeat the step.
- **Image scale slider remembers its last position** between launches. Always verify the scale label matches the required batch before clicking Upscayl.

Per-batch GUI steps:

1. Launch or bring Upscayl to front: `C:\Program Files\Upscayl\Upscayl.exe`
2. Enable "Batch Upscayl" toggle → verify button changes to "Select Folder"
3. Click "Select Folder" → pick `staging\[batch_name]\`
4. Verify model shows "UltraSharp (Non-Commercial)" → change if wrong
5. Verify Image Scale label shows correct Nx → drag slider to fix if wrong
6. Click "Set Output Folder" → pick `downloads\upscaled\[date]\` → hover to confirm tooltip shows path
7. Click "Upscayl 🚀" → wait for completion (poll every 10s; max 30 min; complete when progress bar clears and output file count matches input)
8. Verify output count and log result
9. For the next batch, return to step 3; only the folder and scale change — do not restart the app

After all batches: copy sidecars to the output folder and clean staging folders the same way as CLI mode.

---

## OUTPUTS AND HANDOFF

Primary output folder: `PROJECT_ROOT\downloads\upscaled\[YYYY-MM-DD]\`

Every output image must have its matching sidecar next to it in the output folder.

Update after each batch: `image_registry.json`, `upscaler_state.json`

Handoff: `Next execution file: 04_METADATA_OPTIMIZER.md`

---

## SUCCESS CRITERIA

This file is complete when:

- every input image is registered with correct dimensions and scale assignment
- every image has exactly one sidecar
- all images are in `downloads\upscaled\` with matching sidecars
- registry entries point to final output paths
- staging folders are cleaned
- manual-image bootstrap sidecars exist where required
