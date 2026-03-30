# 03_IMAGE_UPSCALER.md
## Adobe Stock Automation System · Execution File 3

---

## PURPOSE

Normalize every image in `downloads\`, keep the registry accurate, generate full metadata for manual images during the scan phase, and upscale everything possible to a 4K-ready output set.

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

## SUB-AGENT SYSTEM

This file is complex enough to benefit from a light sub-agent split.

- **Sub-Agent A — Registry + Naming**
  Scans `downloads\`, normalizes manual filenames, and updates `image_registry.json`.
- **Sub-Agent B — Manual Metadata Generator**
  Performs visual analysis and writes complete sidecars for manual images during File 03.
- **Sub-Agent C — Upscale Runner**
  Handles staging, CLI/GUI upscale execution, output verification, and final registry updates.
- **Sub-Agent D — Failure Quarantine**
  Moves failed assets and their related files into `downloads\failed\[YYYY-MM-DD]\[asset_name]\` and writes the failure marker JSON.

Rules:

- Sub-Agent B must finish before any manual image can enter upscale.
- Sub-Agent D owns any asset with failed analysis, failed upscale, or missing upscale output.

## MANDATORY PLANNER / GENERATOR / EVALUATOR LOOP

This file must run under Planner -> Generator -> Evaluator by default.

- **Planner**
  reads this file fully and extracts scan rules, naming rules, registry parity requirements, metadata-generation rules for manual images, scale assignment, failure quarantine, and batch/fifo execution rules
- **Generator**
  performs the real scan, registration, sidecar generation, upscale execution, registry updates, and failure quarantine actions
- **Evaluator**
  checks that:
  - every valid image has exactly one sidecar
  - manual images received full metadata before upscale
  - the correct scale bucket was chosen
  - upscaled output and sidecar parity are intact
  - failures were quarantined correctly with the related files
  - `image_registry.json` reflects the true final state

If the Evaluator finds a parity issue, bad registry state, missing sidecar, skipped manual metadata generation, wrong scale assignment, or incorrect failure handling, the Generator must revise before the stage can pass.

If true parallel agents are unavailable, preserve the same Planner -> Generator -> Evaluator sequence in one controller session.

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
- must be renamed, registered, and given a **complete metadata sidecar via visual analysis** before upscaling
- after File 03 runs, manual images have `status: ready_for_upload` — File 04 treats them the same as AI images

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
5. if a manual image has no sidecar: generate the full sidecar now during File 03 before upscale
6. log orphan sidecars (sidecars with no matching image) for manual review
7. do not proceed to upscaling until every image has exactly one sidecar

Failure quarantine rule:

- if an image fails metadata generation, upscale execution, or output verification, move it to `downloads\failed\[YYYY-MM-DD]\[asset_name]\`
- move the image and any matching `.metadata.json`
- write a `.failure.json` marker in the same folder with the reason
- do not hand-write this failure JSON; it is created automatically by the runtime command that failed:

```text
Batch failures: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action batch
FIFO failures:  powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action fifo -ImagePath "[saved_path]"
```

- the failure JSON uses a fixed `reason_code` plus a separate `reason_detail`
- current File 03 reason codes:
  - `manual_metadata_incomplete`
  - `upscale_cli_failed`
  - `upscale_output_missing`

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

## MANUAL IMAGE METADATA GENERATION

When a manual image is registered, **generate its complete metadata immediately** from visual analysis. Do not create a stub and defer this to File 04. By the time any image reaches File 04, it must already have a complete sidecar ready to apply — this keeps File 04 as a simple applier for all images without exception.

### When to run

Run for every manual image during the registry scan. Also run for any AI-generated image whose sidecar is missing (same output format, mark `source: ai_generated`).

### How to analyze the image

Load the image file and inspect it visually. Determine:

- **Primary subject**: what is the main visual element?
- **Setting/environment**: indoor, outdoor, studio, urban, nature?
- **Mood/emotion**: confident, calm, focused, joyful, dramatic?
- **Demographics**: age range, gender, ethnicity if visible?
- **Commercial use cases**: which industry would license this? For what purpose?
- **Composition style**: portrait, wide scene, close-up, overhead, flat-lay?
- **Color palette**: dominant colors, warm/cool tone?
- **Is it AI-generated?** Can you tell from the visual style? Default to `false` for manual images unless obvious AI artifacts are present.

### What to write

Apply the full metadata rules from `STOCK_SUCCESS_REPORT.md`:

**Title** (under 70 chars, buyer-search style, subject + setting + differentiator):
```
[Subject] + [Action/State] + [Setting] + [Modifier]
No "stock photo of", no "AI generated", no filler words
Example: "Diverse professionals collaborating in modern coworking space"
```

**Keywords** (25–35, follow the 35-slot blueprint from the success report):
```
Slots 1–3:   Most specific buyer-intent phrases (3–4 words)
Slots 4–7:   Long-tail conceptual phrases
Slots 8–12:  Descriptive: setting, action, mood, style
Slots 13–20: Conceptual: industry, emotion, abstract meaning
Slots 21–28: Technical: composition, color, demographics
Slots 29–35: Industry and use-case tags
```

**Category**: choose the single most specific applicable category from the Adobe Stock list (same list used in File 04).

**File type**: `Photos` for photorealistic; `Illustrations` for clearly drawn/digital art.

**AI disclosure**: `false` for manual images unless the image is visually clearly AI-generated.

**People/property fictional**: `false` for manual images unless clearly synthetic.

### Output sidecar

Write the complete sidecar alongside the image file before proceeding to upscaling:

```json
{
  "source_image": "downloads\\manual\\manual_sunset_beach_M001_20260328.jpg",
  "source": "manual",
  "status": "ready_for_upload",
  "generated_by": "visual_analysis",
  "adobe_stock_metadata": {
    "title": "Scenic Sunset Over Beach With Golden Reflections",
    "title_char_count": 49,
    "keywords": ["sunset beach", "golden hour ocean", "coastal landscape sunset", "..."],
    "keyword_count": 28,
    "category": "Landscapes",
    "file_type": "Photos",
    "ai_generated": false,
    "people_or_property_fictional": false
  }
}
```

### After generating metadata

The image sidecar status is `ready_for_upload`. File 04 treats it identically to an AI-generated image — no separate analysis path needed.

If visual analysis fails (corrupt file, unreadable image): write an error sidecar with `status: analysis_failed`, log the error, move the asset to `downloads\failed\[YYYY-MM-DD]\[asset_name]\`, and skip that image from upscale. Do not block the rest of the pipeline.

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
- every image has exactly one sidecar with `status: ready_for_upload`
- manual images have full metadata generated from visual analysis (not stubs)
- all images are in `downloads\upscaled\` with matching sidecars
- registry entries point to final output paths
- staging folders are cleaned
