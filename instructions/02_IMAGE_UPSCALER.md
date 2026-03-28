# 02_IMAGE_UPSCALER.md

## Image Registry, Normalization & Upscaling Pipeline

### Adobe Stock Automation System · Part 2 of 3

---

## SYSTEM OVERVIEW

This file governs the **entire image quality pipeline**: scanning the downloads folder for every image regardless of source, normalising filenames and JSON registry entries, analysing resolution to determine the correct upscale factor, and batch-processing images through Upscayl to produce a final 4K-quality output folder that `03_METADATA_OPTIMIZER.md` then passes to Adobe Stock.

**Two types of images are processed identically by this file:**

```
TYPE AI  — Created by file 01_TREND_RESEARCH_AND_IMAGE_CREATION.md (Google Flow AI)
           → Already named correctly (naming convention applied by background watcher)
           → Already has .metadata.json sidecar
           → Resolution: usually ~2752×1536 (2K, needs 2x upscale)
           → May also arrive as intentional 1X fallback if Google Flow 2K failed twice upstream

TYPE MANUAL — Added manually to downloads\ by the user from any source
              → May have arbitrary filename
              → Has NO .metadata.json sidecar
              → Resolution: unknown — must be measured
              → Requires: rename + register + metadata stub creation
```

**Final goal of this pipeline: every image ends up at approximately 4K resolution in `downloads\upscaled\`.**

**Batch-completeness rule from file 01:** File 02 does not require all 4 images from a Flow batch to exist before processing. If file 01 downloaded 1, 2, or 3 successful siblings while another prompt in that batch failed policy and was rewritten upstream, every successfully downloaded image proceeds normally through registry, metadata, and upscaling.

**Rolling-queue rule from file 01:** File 01 now runs as a rolling two-batch pipeline. The first 4 prompts are submitted, then the next 4 prompts are submitted without waiting for full renders. File 02 should therefore expect AI images to arrive out of strict batch order; registration and upscaling must remain image-by-image, not batch-blocked.

---

### ⚠ MANDATORY FIRST ACTION — READ THE SUCCESS REPORT

```
PROJECT_ROOT\instructions\STOCK_SUCCESS_REPORT.md
```

Load into memory before any other action. The success report governs all
commercial-quality decisions made during metadata stub generation for manual images.

```
On success: LOG "Strategy knowledge base loaded. Proceeding."
On failure: LOG "CRITICAL: Report not found. Halting." → EXIT
```

---

### Upscayl App Details

```
GUI path:    C:\Program Files\Upscayl\Upscayl.exe
Version:     2.15.0 (shown in app header)
CLI binary:  C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe  (PRIMARY method)
Models dir:  C:\Program Files\Upscayl\resources\models\
Target model: ultrasharp-4x  (UltraSharp Non-Commercial, always used)
```

---

## PART 1 — SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────────┐
│              STEP 0 — MANDATORY PRE-BOOT                            │
│         READ: STOCK_SUCCESS_REPORT.md → Load into memory            │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────────┐
          ▼                 ▼                       ▼
  [SUB-AGENT E]      [SUB-AGENT F]          [SUB-AGENT G]
  Registry &         Resolution             Upscayl
  Normalizer         Analyzer               Controller
  Agent              Agent                  Agent
          │                 │                       │
          └─────────────────┼───────────────────────┘
                            ▼
                    [IMAGE REGISTRY]
                    image_registry.json
                    (tracks every image
                     in the system —
                     AI + manual, all states)
```

**Pipeline flow:**

```
Sub-Agent E runs first:
  → Scans downloads\ for new/unregistered images
  → Renames non-conforming filenames
  → Registers all images in image_registry.json
  → Creates metadata stubs for manual images

Sub-Agent F runs second:
  → Reads image dimensions for all images pending upscale
  → Groups into staging batches by required scale factor
  → Creates temporary staging directories

Sub-Agent G runs third:
  → Launches Upscayl
  → Configures batch settings per staging folder
  → Runs batch upscale for each group
  → Verifies output
  → Cleans up staging directories
  → Updates registry with upscaled status
```

---

## PART 2 — FOLDER STRUCTURE

```
PROJECT_ROOT\
│
├── instructions\
│   ├── 01_TREND_RESEARCH_AND_IMAGE_CREATION.md
│   ├── 02_IMAGE_UPSCALER.md
│   ├── 03_METADATA_OPTIMIZER.md
│   └── STOCK_SUCCESS_REPORT.md
│
├── scripts\
│   ├── run_02_pipeline.ts
│   ├── reconcile_data_and_sidecars.ts
│   └── [other Flow and Adobe Stock workers]
│
├── downloads\                          ← ALL source images live here
│   ├── [YYYY-MM-DD]\                  ← AI-generated images (from instructions\01_TREND_RESEARCH_AND_IMAGE_CREATION.md)
│   │   ├── image.png
│   │   └── image.metadata.json        ← Sub-Agent D sidecar (already present)
│   ├── manual\                        ← Manually added images from any source
│   └── upscaled\                      ← FINAL OUTPUT — all upscaled 4K images
│
├── data\
│   ├── image_registry.json            ← master registry of ALL images
│   ├── session_state.json
│   ├── upscaler_state.json            ← tracks current 02 session progress
│   ├── descriptions.json
│   ├── accounts.json
│   ├── selectors_registry.json
│   ├── adobe_stock_selectors.json
│   └── static_knowledge_cache.json
│
├── staging\                           ← TEMPORARY — created per run, deleted after
│   ├── x2\                           ← images needing 2x upscale
│   ├── x3\                           ← images needing 3x upscale
│   ├── x4\                           ← images needing 4x upscale
│   └── copy_only\                    ← images already 4K+ (copied, not upscaled)
│
└── logs\
    ├── automation.log                ← single shared runtime log
    └── screenshots\                  ← browser evidence when needed
```

**Rule: Never move or delete files from `downloads\`. Always COPY to staging.**
**The original files in `downloads\` are preserved until manually removed.**

---

## PART 3 — IMAGE NAMING CONVENTION (All Images Must Follow This)

Every image in the system must use one of two naming patterns depending on source:

### AI-Generated Images (already named by file 01_TREND_RESEARCH_AND_IMAGE_CREATION.md background watcher)

```
Format:  [trend_topic]_[series_slot]_L[loop]_[seq]_[YYYYMMDD].png
Example: ai_finance_16A_establishing_L1_001_20260323.png
         climate_tech_1C_flatlay_L2_047_20260324.png
```

### Manually Added Images (renamed by Sub-Agent E)

```
Format:  manual_[slug]_M[seq]_[YYYYMMDD].[ext]
Example: manual_autumn_forest_path_M001_20260323.jpg
         manual_city_skyline_night_M002_20260323.png

Rules for slug:
  - Describe the image content in 2–4 words, lowercase, underscores
  - No special characters, no spaces
  - Keep it meaningful (a buyer could guess the subject from the name)
  - Max 40 characters total for slug portion

Rules for sequence:
  - M prefix indicates manual source (distinguishes from AI-generated seq numbers)
  - Sequential within the session, zero-padded to 3 digits: M001, M002, ...
  - Sequence restarts each day (date suffix prevents collisions)
```

---

## PART 4 — IMAGE REGISTRY: `image_registry.json`

This is the master tracking file for every image in the system. Sub-Agent E creates and maintains it. file 03_METADATA_OPTIMIZER.md reads it to find the upscaled path of each image.

### Registry File Path

```
C:\AdobeStockAutomation\data\image_registry.json
```

### Registry Schema

```json
{
  "last_updated": "YYYY-MM-DDTHH:MM:SSZ",
  "total_images": 0,
  "images": {
    "ai_finance_16A_establishing_L1_001_20260323.png": {
      "source": "ai_generated",
      "final_name": "ai_finance_16A_establishing_L1_001_20260323.png",
      "original_name": "ai_finance_16A_establishing_L1_001_20260323.png",
      "source_path": "downloads\\2026-03-23\\ai_finance_16A_establishing_L1_001_20260323.png",
      "dimensions": { "width": 2752, "height": 1536 },
      "long_side": 2752,
      "assigned_scale": 2,
      "metadata_sidecar": "downloads\\2026-03-23\\ai_finance_16A_establishing_L1_001_20260323.metadata.json",
      "upscaled": false,
      "upscaled_path": null,
      "upscaled_dimensions": null,
      "registered_at": "YYYY-MM-DDTHH:MM:SSZ",
      "upscaled_at": null,
      "adobe_stock_status": "not_uploaded"
    },
    "manual_autumn_forest_path_M001_20260323.jpg": {
      "source": "manual",
      "final_name": "manual_autumn_forest_path_M001_20260323.jpg",
      "original_name": "DSC_4521.jpg",
      "source_path": "downloads\\manual\\manual_autumn_forest_path_M001_20260323.jpg",
      "dimensions": { "width": 1920, "height": 1080 },
      "long_side": 1920,
      "assigned_scale": 2,
      "metadata_sidecar": "downloads\\manual\\manual_autumn_forest_path_M001_20260323.metadata.json",
      "upscaled": false,
      "upscaled_path": null,
      "upscaled_dimensions": null,
      "registered_at": "YYYY-MM-DDTHH:MM:SSZ",
      "upscaled_at": null,
      "adobe_stock_status": "not_uploaded"
    }
  }
}
```

---

## PART 5 — SUB-AGENT E: REGISTRY & NORMALIZER

### Role

Scans every file in `downloads\` (recursively, all subfolders, excluding `upscaled\` and `staging\`), identifies any image not yet in `image_registry.json`, normalises its filename if non-conforming, generates a metadata stub if no sidecar exists, and registers it.

### Scan Protocol

```
STEP 1: Load image_registry.json into memory
  → If file does not exist: create empty registry → save → continue

STEP 2: Recursively scan all files in downloads\
  Exclude these directories from scan:
    - downloads\upscaled\       (output folder — not input)
    - staging\                  (temp folder — not input)
  Include file types: .png, .jpg, .jpeg, .webp, .tif, .tiff
  Exclude files: *.metadata.json, *.json, *.txt, *.md (non-image files)

STEP 3: For each image file found:
  a. Check if the final_name exists as a key in image_registry.json
  b. If EXISTS in registry → skip (already processed)
  c. If NOT in registry → process as new image (Section 5.1)

STEP 4: Verify image/sidecar parity in each scanned folder
  → Count image files vs. .metadata.json files
  → If any image is missing its sidecar: create the missing sidecar immediately
  → If any orphan sidecar exists with no image: log it for review
  → Do NOT proceed to Sub-Agent F until every image has exactly one sidecar

STEP 5: Save updated image_registry.json
STEP 6: Log: "Registry scan complete. [N] new images registered. [N] total in registry."
```

### 5.1 — Processing New Images

```
For each new image not yet in the registry:

ACTION 1: Determine source type
  → If path contains downloads\[YYYY-MM-DD]\ → SOURCE = ai_generated
  → If path contains downloads\manual\ → SOURCE = manual
  → If path is in root downloads\ (no subfolder) → move to downloads\manual\ first

ACTION 2: Check naming convention
  → AI-generated: name must match pattern [topic]_[slot]_L[N]_[seq]_[date].ext
    If matches → name is already correct, use as-is
  → Manual: name must match pattern manual_[slug]_M[seq]_[date].ext
    If DOES NOT match → rename (see Section 5.2)

ACTION 3: Measure image dimensions
  → Read the image file header to extract width × height in pixels
  → No full decode needed — read metadata only (fast)
  → Record: width, height, long_side = max(width, height)

ACTION 4: Assign scale factor
  → Based on long_side, determine which batch this image belongs to:
    long_side ≥ 3840 → assigned_scale = "copy_only"   (already 4K+)
    long_side 1921–3839 → assigned_scale = 2           (2x → ≥3842px)
    long_side 1281–1920 → assigned_scale = 3           (3x → ≥3843px)
    long_side  640–1280 → assigned_scale = 4           (4x → ≥2560px)
    long_side   < 640   → assigned_scale = "low_res"   (flag for review)
  → LOG if assigned_scale == "low_res":
    "⚠ Low-res image detected: [filename] ([long_side]px). Flagging for review."
    "  4x upscale would produce [long_side×4]px — may not meet Adobe Stock quality standards."
    "  Image will be upscaled with 4x but manually review before uploading."
    → Treat as x4 batch but mark in registry: "quality_flag": "review_before_upload"

ACTION 5: Check for metadata sidecar
  → Look for [image_basename].metadata.json in the same folder
  → AI-generated: sidecar should already exist (created by Sub-Agent D in file 01_TREND_RESEARCH_AND_IMAGE_CREATION.md)
    If missing: LOG warning "Missing sidecar for AI image [name]. Will be created."
                → create minimal stub (see Section 5.3)
  → Manual: sidecar will NOT exist → create metadata stub (see Section 5.3)
  → After this action completes, the folder parity rule must hold:
    1 image file = 1 .metadata.json sidecar

ACTION 6: Register in image_registry.json
  → Add a new entry with all collected data
  → Set "upscaled": false, "upscaled_path": null
  → Set "registered_at": current timestamp
```

### 5.2 — Renaming Non-Conforming Files (Manual Images)

```
INPUT: Any file with a non-standard name (e.g., DSC_4521.jpg, photo_final_v2.png)

STEP 1: Generate a slug from the filename
  → Strip extension and common camera/phone prefixes (DSC_, IMG_, DCIM_, etc.)
  → Replace spaces and special chars with underscores
  → Convert to lowercase
  → Truncate to max 40 characters
  → If the slug is still meaningless (e.g., just numbers): use "image" as fallback slug
  → Human-readable suggestion: use the first 2–3 meaningful words

STEP 2: Assign sequence number
  → Count existing manual images registered TODAY in image_registry.json
  → next_seq = count + 1
  → Format: M[next_seq zero-padded to 3 digits]

STEP 3: Build new filename
  new_name = manual_[slug]_M[seq]_[YYYYMMDD].[original_ext]
  Examples:
    DSC_4521.jpg   → manual_dsc_4521_M001_20260323.jpg (no good slug possible, use original number)
    sunset_beach.jpg → manual_sunset_beach_M001_20260323.jpg
    photo_final_v2.png → manual_photo_final_v2_M001_20260323.png

STEP 4: Rename the file on disk
  → os.rename(old_path, new_path)
  → Old file is GONE — only new name exists
  → LOG: "Renamed: [old_name] → [new_name]"

STEP 5: Return new_name for use in registry registration
```

### 5.3 — Metadata Stub Creation (Manual Images and Missing AI Sidecars)

For manual images, a metadata stub is created now and will be **enhanced by file 03_METADATA_OPTIMIZER.md** when the image is uploaded to Adobe Stock. The stub provides structure and all known facts; title/keywords are placeholders that file 03_METADATA_OPTIMIZER.md will fill in.

```json
{
  "image_file": "manual_autumn_forest_path_M001_20260323.jpg",
  "generated_at": "YYYY-MM-DDTHH:MM:SSZ",
  "source": "manual",
  "series_slot": null,
  "aspect_ratio": "detected_from_dimensions",
  "trend_topic": null,
  "trend_category": null,
  "loop_index": null,

  "adobe_stock_metadata": {
    "title": "[NEEDS MANUAL REVIEW — set by file 03_METADATA_OPTIMIZER.md]",
    "title_char_count": 0,
    "keywords": [],
    "keyword_count": 0,
    "category": "[NEEDS MANUAL REVIEW — set by file 03_METADATA_OPTIMIZER.md]",
    "file_type": "Photos",
    "created_with_ai": false,
    "people_are_fictional": false,
    "editorial_use_only": false
  },

  "generation_context": {
    "prompt_used": null,
    "model_used": null,
    "commercial_use_cases": [],
    "visual_keywords_from_trend": []
  },

  "status": "stub_created_pending_review",
  "applied_to_adobe_stock": false
}
```

**file 03_METADATA_OPTIMIZER.md behaviour for stub sidecars:** When file 03_METADATA_OPTIMIZER.md encounters an image whose sidecar has `"status": "stub_created_pending_review"`, it treats it as a TYPE B image — it performs a full visual analysis and rewrites the stub metadata completely before applying it to Adobe Stock.

---

## PART 6 — SUB-AGENT F: RESOLUTION ANALYZER & BATCH ORGANIZER

### Role

Reads `image_registry.json`, identifies all images where `"upscaled": false`, groups them by `assigned_scale`, and sets up the `staging\` directory structure for the upscaling pass.

### Resolution Grouping Logic

```
SCALE FACTOR DETERMINATION (based on long side — the largest of width or height):

  ┌──────────────────────────────────────────────────────────┐
  │  Long Side (px)  │  Scale  │  Result Long Side (approx)  │
  ├──────────────────┼─────────┼─────────────────────────────┤
  │  ≥ 3840          │  copy   │  already 4K+ — no upscale   │
  │  1921 – 3839     │    2x   │  3842 – 7678 px  ✓ 4K+     │
  │  1281 – 1920     │    3x   │  3843 – 5760 px  ✓ 4K+     │
  │   640 – 1280     │    4x   │  2560 – 5120 px  ⚠ may be  │
  │                  │         │  below 4K for small images │
  │    < 640         │    4x   │  flag for review           │
  └──────────────────┴─────────┴────────────────────────────┘

NOTE: The 2K images from file 01_TREND_RESEARCH_AND_IMAGE_CREATION.md (long side ≈ 2752px) fall into the 2x group.
      2752 × 2 = 5504px — well above 4K ✓
```

### Staging Setup

```
STEP 1: Create staging directories (if they don't exist)
  PROJECT_ROOT\staging\x2\
  PROJECT_ROOT\staging\x3\
  PROJECT_ROOT\staging\x4\
  PROJECT_ROOT\staging\copy_only\

STEP 2: Clear any leftover files from previous runs
  → Delete all files inside each staging subfolder (NOT the folders themselves)

STEP 3: Group images into batches
  → Read all registry entries where "upscaled": false
  → For each image, read its "assigned_scale" field
  → COPY (not move) the image to the corresponding staging subfolder:
    assigned_scale == 2         → staging\x2\
    assigned_scale == 3         → staging\x3\
    assigned_scale == 4         → staging\x4\
    assigned_scale == "copy_only" → staging\copy_only\
    assigned_scale == "low_res" → staging\x4\  (with quality_flag already set)

STEP 4: Report
  LOG: "Batch groups ready:"
  LOG: "  x2:        [N] images  (target: ~4K+ after 2x)"
  LOG: "  x3:        [N] images  (target: ~4K+ after 3x)"
  LOG: "  x4:        [N] images  (target: ~4K+ after 4x)"
  LOG: "  copy_only: [N] images  (already 4K+, no upscale)"
  LOG: "  Total pending upscale: [N] images"

STEP 5: Log skip conditions
  → If a staging subfolder is empty after grouping → log and skip that batch
  → Example: LOG "x3 batch: empty — skipping"
```

---

## PART 7 — SUB-AGENT G: UPSCAYL CONTROLLER

### Overview

Upscayl is controlled in two ways. The CLI binary is faster, more reliable, and requires no GUI interaction. The GUI method is the fallback if the binary cannot be found.

```
METHOD SELECTION (run on first session, result cached in upscaler_state.json):

  STEP 1: Check for CLI binary
    → Search for upscayl-bin.exe:
      Path 1: C:\Program Files\Upscayl\resources\bin\upscayl-bin.exe
      Path 2: C:\Program Files\Upscayl\resources\bin\realesrgan-ncnn-vulkan.exe
      Path 3: Any .exe in C:\Program Files\Upscayl\resources\bin\

  STEP 2: If binary found → test it
    → Run: [binary] --help  OR  [binary] -h
    → If exits without error → CLI method confirmed
    → Save binary path to upscaler_state.json: "cli_binary_path": "[path]"
    → LOG: "CLI binary found at [path]. Using CLI method."

  STEP 3: If binary NOT found or test fails:
    → LOG: "CLI binary not found. Falling back to GUI automation."
    → Save to upscaler_state.json: "cli_binary_path": null, "method": "gui"
    → Use GUI method (Section 7.2)
```

### 7.1 — CLI Method (Primary)

The CLI binary processes an entire folder at once. Run one command per staging batch.

#### CLI Command Structure

```powershell
& "[cli_binary_path]" `
    -i "[input_folder]" `
    -o "[output_folder]" `
    -s [scale_factor] `
    -n "ultrasharp" `
    -f "png"
```

**Parameters:**

```
-i  Input folder path (the staging subfolder for this batch)
-o  Output folder path (always: downloads\upscaled\[YYYY-MM-DD]\)
-s  Scale factor integer: 2, 3, or 4
-n  Model name: "ultrasharp" (matches the UltraSharp model file in models\)
-f  Output format: "png" (lossless, required for Adobe Stock quality)
```

#### Batch Execution Loop

```
Output folder: PROJECT_ROOT\downloads\upscaled\[today_YYYY-MM-DD]\
Create output folder if it does not exist.

FOR EACH non-empty staging batch (in order: x2, x3, x4):

  STEP 1: Build the command
    input  = PROJECT_ROOT\staging\[batch_name]\
    output = PROJECT_ROOT\downloads\upscaled\[YYYY-MM-DD]\
    scale  = batch scale number (2, 3, or 4)

  STEP 2: Log the command before running
    LOG: "Running CLI: [full command]"
    LOG: "Processing [N] images at [scale]x scale..."

  STEP 3: Execute the command
    → Use child_process.spawn() or PowerShell Invoke-Expression
    → Stream stdout/stderr to logs\automation.log in real-time
    → Wait for process to exit (this is synchronous — wait for completion before next batch)

  STEP 4: Check exit code
    → Exit code 0 → success → proceed to verification
    → Exit code non-0 → log error → retry once → if still fails → log and skip batch

  STEP 5: Verify output
    → Count files in output folder after this batch
    → Compare to count of files copied into input staging folder
    → If count matches → batch verified
    → If count is less: LOG "⚠ [N] images may have failed in [batch] batch. Check upscaler_log."

SEPARATE HANDLING FOR copy_only:
  → These images need NO upscaling
  → Simply COPY each file from staging\copy_only\ to downloads\upscaled\[YYYY-MM-DD]\
  → No CLI command needed
  → Also copy their .metadata.json sidecar alongside them
```

#### Model Name Discovery

```
The correct model name for the -n flag may vary slightly by Upscayl version.
On first run, discover it:

  STEP 1: List files in: C:\Program Files\Upscayl\resources\models\
  STEP 2: Find a file matching: *ultrasharp* or *ultra-sharp* (case-insensitive)
  STEP 3: Use the filename WITHOUT extension as the -n value
  STEP 4: Cache in upscaler_state.json: "model_name": "[discovered_name]"

Example: if file is "ultrasharp-4x.param" → use -n "ultrasharp-4x"
         if file is "UltraSharp_4x.param" → use -n "UltraSharp_4x"
```

---

### 7.2 — GUI Method (Fallback — only if CLI binary not found)

If the CLI binary is unavailable, Upscayl's GUI must be automated. The GUI is an Electron app on Windows. This section uses Node.js with `@nut-tree/nut-js` for desktop automation.

**Install dependency once:**

```bash
npm install @nut-tree/nut-js
```

#### GUI Automation Sequence (per batch)

For each staging batch that needs processing:

```
STEP 1: LAUNCH UPSCAYL
  → Check if Upscayl is already running:
    PowerShell: Get-Process "Upscayl" -ErrorAction SilentlyContinue
    If running → bring to front via PowerShell (AppActivate)
    If not running → launch: Start-Process "C:\Program Files\Upscayl\Upscayl.exe"
    Wait for window to appear: poll for process + window title "Upscayl" → max 15s

STEP 2: ENABLE BATCH UPSCAYL TOGGLE
  Context: "Batch Upscayl" toggle is OFF by default every time the app opens.
  Action required: click the toggle to enable batch mode.
  → Locate the toggle by window coordinates or accessibility API
  → The toggle is in the top-left area of the left panel, below the Upscayl/Settings tabs
  → Verify it is OFF (dark/grey state) → click it → verify it turns ON (lit state)
  → After enabling: "Select Image" button changes to "Select Folder" (batch mode confirmed)
  → Wait 500ms for UI to update

STEP 3: CLICK "SELECT FOLDER" (STEP 1 in Upscayl UI)
  → Click the "Select Folder" button (appears after enabling batch mode)
  → A Windows folder picker dialog opens
  → Type the staging input path directly in the dialog address bar:
    PROJECT_ROOT\staging\[batch_name]\
    (e.g., PROJECT_ROOT\staging\x2\)
  → Press Enter or click Select Folder
  → Wait for dialog to close (300ms)
  → Verify: Upscayl UI shows the selected folder path (or file count changes)

STEP 4: VERIFY AI MODEL — "Select AI Model" (STEP 2 in Upscayl UI)
  → Read the current model shown in the model dropdown
  → Should show "UltraSharp (Non-Commercial)"
  → If CORRECT → no action needed, leave it
  → If WRONG → click the dropdown → find "UltraSharp (Non-Commercial)" → click it
  → Wait 300ms

STEP 5: VERIFY / SET IMAGE SCALE (below model selector in Upscayl UI)
  Context: Image scale slider remembers last position between launches.
  Action: verify it matches the current batch's required scale factor.
  → Read the current Image Scale label (shows "2x", "3x", "4x" etc.)
  → If CORRECT → no action needed
  → If WRONG → drag the slider to the correct position:
    The slider has discrete stops at 1x, 2x, 3x, 4x
    Drag left for lower scale, right for higher scale
    Stop when the label shows the correct "Nx" value
  → Wait 300ms for UI to update

STEP 6: SET OUTPUT FOLDER (STEP 3 in Upscayl UI)
  Context: Output folder is NOT remembered between launches. Must be set every session.
  Action: click "Set Output Folder" and select the output directory.
  → Click the "Set Output Folder" button
  → A Windows folder picker dialog opens
  → Navigate to: C:\AdobeStockAutomation\downloads\upscaled\[YYYY-MM-DD]\
    (create this folder first if it doesn't exist)
  → Press Enter or click Select Folder
  → Wait for dialog to close (300ms)
  → VERIFY output folder is set:
    Hover over the "Set Output Folder" button
    A tooltip/popup should appear showing the selected folder path
    If tooltip shows the correct path → confirmed ✓
    If tooltip shows nothing or wrong path → re-do this step

STEP 7: CLICK UPSCAYL (STEP 4 in Upscayl UI)
  → Click the purple "Upscayl 🚀" button at the bottom of the left panel
  → Upscaling begins — a progress bar or percentage indicator appears
  → WAIT for upscaling to complete:
    Poll for completion every 10 seconds
    Completion signals:
      a. Progress bar disappears / resets
      b. "Upscayl 🚀" button becomes clickable again
      c. Output folder shows N new files (matches input count)
    Max wait: 30 minutes (large batches at 4x can take longer on slow GPUs)
    → If timeout exceeded → log warning → check output folder → continue

STEP 8: VERIFY OUTPUT
  → Count files in output folder
  → Compare to input staging folder count
  → Log result

STEP 9: NEXT BATCH
  → If more batches remain → return to STEP 3 (select folder for next batch)
  → Do NOT restart the app between batches — it stays open
  → Only scale verification (STEP 5) and folder selection (STEP 3 and STEP 6) change per batch
```

---

### 7.3 — Post-Upscaling: Sidecar Propagation

After upscaling, every image in `downloads\upscaled\[date]\` needs its `.metadata.json` sidecar copied alongside it.

```
FOR EACH image now in downloads\upscaled\[date]\:

  STEP 1: Find the original source image in image_registry.json
    → Match by filename (base name, no extension)

  STEP 2: Copy the sidecar alongside the upscaled image
    Source sidecar: registry entry "metadata_sidecar" path
    Destination:    downloads\upscaled\[date]\[image_basename].metadata.json

  STEP 3: Update image_registry.json entry:
    "upscaled": true
    "upscaled_path": "downloads\\upscaled\\[date]\\[filename]"
    "upscaled_dimensions": { "width": [measured], "height": [measured] }
    "upscaled_at": [current timestamp]

  STEP 4: Log: "Upscaled + sidecar copied: [filename] → upscaled\[date]\"
```

---

### 7.4 — Staging Cleanup

```
After ALL batches are complete and verified:

  → Delete all files inside:
    PROJECT_ROOT\staging\x2\
    PROJECT_ROOT\staging\x3\
    PROJECT_ROOT\staging\x4\
    PROJECT_ROOT\staging\copy_only\
  → Keep the staging FOLDERS (just delete their contents)
  → LOG: "Staging folders cleaned."

Note: Source images in downloads\ are NEVER deleted by this script.
      Only the temp copies in staging\ are removed.
```

---

## PART 8 — UPSCALER STATE FILE: `upscaler_state.json`

Tracks the persistent configuration discovered on first run. Saves time on subsequent runs by avoiding re-discovery of binary path and model name.

```json
{
  "last_updated": "YYYY-MM-DDTHH:MM:SSZ",
  "upscayl_exe_path": "C:\\Program Files\\Upscayl\\Upscayl.exe",
  "method": "cli",
  "cli_binary_path": "C:\\Program Files\\Upscayl\\resources\\bin\\upscayl-bin.exe",
  "models_dir": "C:\\Program Files\\Upscayl\\resources\\models\\",
  "model_name": "ultrasharp-4x",
  "output_base_folder": "C:\\Users\\11\\Downloads\\Cron\\AdobeStockAutomation\\downloads\\upscaled",
  "staging_base_folder": "C:\\Users\\11\\Downloads\\Cron\\AdobeStockAutomation\\staging",
  "default_scale_for_ai_images": 2,
  "max_scale_allowed": 4
}
```

---

## PART 9 — SESSION STATE FILE: `upscaler_session_state.json`

Tracks current-session progress. Allows resuming after interruption.

```json
{
  "session_date": "YYYY-MM-DD",
  "output_folder": "PROJECT_ROOT\\downloads\\upscaled\\[YYYY-MM-DD]",
  "sub_agent_e_complete": false,
  "sub_agent_f_complete": false,
  "sub_agent_g_complete": false,
  "batches": {
    "x2": { "image_count": 0, "processed": false, "verified": false },
    "x3": { "image_count": 0, "processed": false, "verified": false },
    "x4": { "image_count": 0, "processed": false, "verified": false },
    "copy_only": { "image_count": 0, "processed": false }
  },
  "images_upscaled": 0,
  "images_failed": [],
  "errors": []
}
```

---

## PART 10 — FULL EXECUTION FLOW

```
═══════════════════════════════════════════════════════
  STEP 0 — READ STOCK_SUCCESS_REPORT.md
═══════════════════════════════════════════════════════
     │
     ▼
SUB-AGENT E: Registry & Normalizer
────────────────────────────────────
Scan downloads\ (exclude upscaled\, staging\)
For each new/unregistered image:
  → TYPE AI:   verify name ✓, measure dims, assign scale, verify sidecar
               NOTE: Source files may be either Google Flow 2K downloads OR
                     1X fallback downloads when Flow's 2K option failed twice.
                     Treat both as valid automation output and assign scale
                     from the actual measured dimensions — never reject 1X
                     fallback files if they were intentionally downloaded after
                     two failed 2K attempts.
  → TYPE MANUAL: rename to naming convention, measure dims, assign scale,
                 create metadata stub sidecar, register in image_registry.json
Save image_registry.json
     │
     ▼
SUB-AGENT F: Resolution Analyzer & Batch Organizer
────────────────────────────────────────────────────
Read all registry entries where "upscaled": false
Group by assigned_scale into 4 buckets:
  x2 bucket:        long side 1921–3839px
  x3 bucket:        long side 1281–1920px
  x4 bucket:        long side 640–1280px (also <640px with quality flag)
  copy_only bucket: long side ≥3840px
Clear staging\x2\, x3\, x4\, copy_only\
COPY (not move) each image into its staging subfolder
Create output folder: downloads\upscaled\[today]\
     │
     ▼
SUB-AGENT G: Upscayl Controller
─────────────────────────────────
Discover method (CLI or GUI) → load from upscaler_state.json or detect fresh
     │
  ┌──┴──┐
  CLI  GUI
  │     │
  ▼     ▼
FOR EACH non-empty batch (x2, x3, x4):
  CLI: run command with correct -s flag → wait → verify output count
  GUI: launch/focus app → enable batch → select folder → verify model
        → set/verify scale → set output folder (ALWAYS set, not remembered)
        → click Upscayl → wait for completion → verify
  THEN: copy_only → just copy files + sidecars directly, no upscale

After all batches:
  → Propagate sidecars to upscaled\ folder
  → Update image_registry.json for all upscaled images
  → Clean up staging\ contents
     │
     ▼
SESSION COMPLETE
─────────────────
Write logs\automation.log:
  - Images processed: [N]
  - x2 batch: [N] images → 2x → avg output: [dims]
  - x3 batch: [N] images → 3x → avg output: [dims]
  - x4 batch: [N] images → 4x → avg output: [dims]
  - copy_only: [N] images → no change
  - Failed: [N] (filenames listed)
  - Quality flags (review before upload): [list]
  - Output folder: downloads\upscaled\[date]\

Update session_state.json handoff block for file instructions\03_METADATA_OPTIMIZER.md
EXIT
```

---

## PART 11 — ERROR HANDLING


| Error                                  | Detection                                      | Recovery                                          |
| -------------------------------------- | ---------------------------------------------- | ------------------------------------------------- |
| CLI binary not found                   | File not at expected paths                     | Fall back to GUI method; cache result             |
| CLI exits with non-zero                | Process exit code ≠ 0                          | Retry once; if fails again log + skip batch       |
| Upscayl window not found               | Process launched but no window detected in 15s | Kill process; re-launch; retry                    |
| Folder picker did not accept path      | Dialog still open after 3s                     | Try again using keyboard shortcut to paste path   |
| Scale slider in wrong position         | Label shows wrong Nx                           | Retry drag up to 3 times; log if stuck            |
| Output folder tooltip empty after set  | Tooltip shows nothing on hover                 | Re-click Set Output Folder; retry                 |
| Output count < input count             | Fewer files in output than staging             | Log with specific filenames; flag in registry     |
| Image dimensions cannot be read        | Corrupt or zero-byte file                      | Skip registration; log; do not add to registry    |
| Manual image slug is empty/meaningless | Slug shorter than 3 chars after cleaning       | Use "image" as fallback slug + original seq       |
| Staging copy fails (disk full)         | Write error during copy                        | Log immediately; halt and report disk space issue |


### Retry Policy

```
max_retries: 3
retry_delay: 2s → 4s → 8s (exponential backoff)
After 3 retries: skip + log + continue session
Never halt the entire session for a single image failure
```

---

## PART 12 — CONFIGURATION CONSTANTS

```json
{
  "config": {
    "success_report_path": "PROJECT_ROOT\\instructions\\STOCK_SUCCESS_REPORT.md",
    "downloads_folder": "PROJECT_ROOT\\downloads",
    "manual_subfolder": "PROJECT_ROOT\\downloads\\manual",
    "upscaled_output_folder": "PROJECT_ROOT\\downloads\\upscaled",
    "staging_folder": "PROJECT_ROOT\\staging",
    "data_folder": "PROJECT_ROOT\\data",
    "logs_folder": "PROJECT_ROOT\\logs",
    "image_registry_file": "PROJECT_ROOT\\data\\image_registry.json",
    "upscaler_state_file": "PROJECT_ROOT\\data\\upscaler_state.json",
    "upscayl_exe": "C:\\Program Files\\Upscayl\\Upscayl.exe",
    "upscayl_bin_default": "C:\\Program Files\\Upscayl\\resources\\bin\\upscayl-bin.exe",
    "upscayl_models_dir": "C:\\Program Files\\Upscayl\\resources\\models",
    "upscayl_model": "ultrasharp-4x",
    "upscayl_output_format": "png",
    "max_scale_factor": 4,
    "scale_thresholds": {
      "copy_only_min_long_side": 3840,
      "x2_min_long_side": 1921,
      "x3_min_long_side": 1281,
      "x4_min_long_side": 640,
      "low_res_below": 640
    },
    "scan_extensions": [".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"],
    "scan_exclude_folders": ["upscaled", "staging"],
    "gui_window_ready_timeout_ms": 15000,
    "upscale_completion_timeout_minutes": 30,
    "upscale_poll_interval_seconds": 10,
    "next_pipeline_file": "instructions\\03_METADATA_OPTIMIZER.md"
  }
}
```

---

## PART 13 — HANDOFF TO 03_METADATA_OPTIMIZER

At session end, write to `session_state.json`:

```json
{
  "file_02_status": "complete",
  "handoff_to_03_metadata": {
    "upscaled_images_folder": "PROJECT_ROOT\\downloads\\upscaled\\[YYYY-MM-DD]",
    "image_registry": "PROJECT_ROOT\\data\\image_registry.json",
    "images_upscaled_count": "[N]",
    "images_with_complete_sidecars": "[N]",
    "images_with_stub_sidecars": "[N manual images — file instructions\\03_METADATA_OPTIMIZER.md will handle]",
    "images_flagged_for_review": "[N — low-res quality flags]"
  }
}
```

`instructions\03_METADATA_OPTIMIZER.md` reads `image_registry.json` to find the `upscaled_path` for each image. When the image is uploaded to Adobe Stock by the user, file `instructions\03_METADATA_OPTIMIZER.md` matches the Adobe Stock "Original name(s)" back to `image_registry.json` → finds the upscaled path → loads the `.metadata.json` sidecar from the same folder.

---

*02_IMAGE_UPSCALER.md END*
*Previous: instructions\01_TREND_RESEARCH_AND_IMAGE_CREATION.md*
*Next: instructions\03_METADATA_OPTIMIZER.md*
