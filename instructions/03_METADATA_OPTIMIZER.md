# 03_METADATA_OPTIMIZER.md
## Adobe Stock Metadata Application Agent
### Adobe Stock Automation System · Part 3 of 3

---

## SYSTEM OVERVIEW

This file governs the **final metadata pipeline**: opening each uploaded image on Adobe Stock's contributor portal, loading its pre-written metadata from the `.metadata.json` sidecar file, applying every field to the correct form element, and saving the image in a ready-to-submit state. The user reviews and submits manually.

**Source of truth for images:** `image_registry.json` at `PROJECT_ROOT\data\image_registry.json`
This registry (managed by FILE_02) tracks every image in the system, including its `upscaled_path` — the path to the 4K version in `downloads\upscaled\`. When a user uploads an image to Adobe Stock, FILE_03 matches the Adobe Stock "Original name(s)" field back to the registry to find the correct sidecar.

**This agent is a fast, reliable APPLIER — not an analyser.** All metadata was written at image creation time (Sub-Agent D for AI images) or will be generated during this step (manually added images with stub sidecars). This agent's job is to match, load, verify, and apply.

---

### ⚠ MANDATORY FIRST ACTION — READ THE SUCCESS REPORT

**Before executing ANY step — the agent MUST read:**

```
PROJECT_ROOT\instructions\STOCK_SUCCESS_REPORT.md
```

This gives the agent the full context needed to:
- Detect weak metadata on previously uploaded (non-automated) images
- Rewrite titles and keywords to the correct standard when needed
- Understand which categories, niches, and keyword structures perform best
- Make intelligent decisions about images that have no sidecar file

```
On success: LOG "Strategy knowledge base loaded. Proceeding."
On failure: LOG "CRITICAL: STOCK_SUCCESS_REPORT.md not found. Halting." → EXIT
```

---

### Target URL

```
https://contributor.stock.adobe.com/en/uploads
```

---

### Two Types of Images in the Queue

```
TYPE A — Automated images (created by file instructions\01_TREND_RESEARCH_AND_IMAGE_CREATION.md, upscaled by file instructions\02_IMAGE_UPSCALER.md):
  → Have a complete .metadata.json sidecar (written by Sub-Agent D at creation time)
  → Sidecar status: "ready_for_upload" or "applied_to_adobe_stock": false
  → Matched via image_registry.json → upscaled_path → load sidecar from same folder
  → Quick visual sanity check only (5 seconds) → apply all fields → save

TYPE B — Manually added images (dropped in downloads\manual\, upscaled by FILE_02):
  → Have a stub .metadata.json sidecar (written by FILE_02 Sub-Agent E)
  → Sidecar status: "stub_created_pending_review"
  → No generation context, no pre-written title or keywords
  → Agent performs full visual analysis + applies STOCK_SUCCESS_REPORT.md standards
  → Rewrites the stub completely → applies → saves
```

### How to Find the Sidecar for Any Uploaded Image

```
When Adobe Stock shows "File ID(s): XXXXXX - Original name(s): [filename]":

STEP 1: Read the original filename from that text
STEP 2: Look up filename (without extension) in image_registry.json
STEP 3: Read the "upscaled_path" field from the registry entry
        Example: "downloads\\upscaled\\2026-03-23\\ai_finance_16A_establishing_L1_001_20260323.png"
STEP 4: Sidecar is at same path with .metadata.json extension:
        "downloads\\upscaled\\2026-03-23\\ai_finance_16A_establishing_L1_001_20260323.metadata.json"
STEP 5: Load the sidecar and check its "status" field:
        "ready_for_upload" → TYPE A (complete metadata, apply directly)
        "stub_created_pending_review" → TYPE B (incomplete, rewrite needed)
```

---

## PART 1 — BROWSER SETUP & CONNECTION

### Browser Launch

```
This agent uses the same browser-automation-core framework as FILE_01.

CHECK: Is the debug browser already running on port 9222?
  → Use isDebugPortReady(9222) from browser_core.ts
  → If YES → connect directly: connectBrowser(9222)
  → If NO → launch:
     C:\Users\11\browser-automation-core\launch_browser.bat 9222 AdobeStockProfile

After connecting:
  → Use findPageByUrl(browser, "contributor.stock.adobe.com") to find the tab
  → If not found → open new tab → navigate to:
     https://contributor.stock.adobe.com/en/uploads
  → Wait for page load (networkidle or DOM stable for 2s)
  → Verify: upload grid is visible
```

### Selector Registry

```
Selectors file: PROJECT_ROOT\data\adobe_stock_selectors.json

This is SEPARATE from selectors_registry.json (which is for Google Flow).
Adobe Stock is a different site — it has its own selector registry.

On first run: "selectors_discovered": false → run discovery protocol (Section 2)
On subsequent runs: load from cache → use directly
On selector failure: re-discover only the failed selector → update cache
```

---

## PART 2 — SELECTOR DISCOVERY (Adobe Stock Contributor Portal)

Adobe Stock's contributor portal is NOT a fully dynamic React SPA like Google Flow. Most elements are present in the DOM on page load. Some elements (dropdowns, panels) are conditionally rendered. The same cache-first, fail-triggered-rediscovery approach applies.

### `adobe_stock_selectors.json` Structure

```json
{
  "last_updated": "YYYY-MM-DDTHH:MM:SSZ",
  "selectors_discovered": false,
  "site": "contributor.stock.adobe.com",
  "selectors": {

    "image_grid_thumbnail": {
      "description": "Individual image thumbnail in the upload queue grid",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "discovery_strategy": "Find the grid container, then locate clickable image elements within it",
      "interaction": "click to select and open right panel"
    },

    "right_panel_container": {
      "description": "The right metadata panel that appears when an image is selected",
      "trigger_required": true,
      "trigger_action": "click on any image thumbnail",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "interaction": "parent container for all metadata fields"
    },

    "file_type_select": {
      "description": "File type dropdown (Photos / Illustrations)",
      "trigger_required": true,
      "trigger_action": "click on any image thumbnail",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "interaction": "select element — use .value or click option"
    },

    "category_select": {
      "description": "Category dropdown",
      "trigger_required": true,
      "trigger_action": "click on any image thumbnail",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "interaction": "select element — use .value or click option"
    },

    "language_select": {
      "description": "Language selector (I'm writing title & keywords in)",
      "trigger_required": true,
      "trigger_action": "click on any image thumbnail",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "interaction": "select element — verify English is selected, change only if not"
    },

    "ai_generated_checkbox": {
      "description": "Created using generative AI tools checkbox",
      "trigger_required": true,
      "trigger_action": "click on any image thumbnail",
      "selector": "input[name='content-tagger-generative-ai-checkbox']",
      "fallback_id": "content-tagger-generative-ai-checkbox",
      "interaction": "click to check — reveals People and Property are fictional checkbox below"
    },

    "people_property_fictional_checkbox": {
      "description": "People and Property are fictional checkbox (appears after AI checkbox is checked)",
      "trigger_required": true,
      "trigger_action": "check ai_generated_checkbox first",
      "selector": "input[name='content-tagger-generative-ai-property-release-checkbox']",
      "fallback_id": "content-tagger-generative-ai-property-release-checkbox",
      "interaction": "click to check — makes Recognizable people or property selector disappear"
    },

    "recognizable_people_yes": {
      "description": "Yes radio button for Recognizable people or property (disappears after fictional checkbox)",
      "trigger_required": false,
      "selector": "input[data-t='has-release-yes']",
      "interaction": "only present when fictional checkbox is NOT checked — should disappear after check"
    },

    "recognizable_people_no": {
      "description": "No radio button for Recognizable people or property",
      "trigger_required": false,
      "selector": "input[data-t='has-release-no']",
      "interaction": "only present when fictional checkbox is NOT checked"
    },

    "title_textarea": {
      "description": "Content title textarea (max 200 characters)",
      "trigger_required": true,
      "trigger_action": "click on any image thumbnail",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_placeholder": "Type title here (max: 200 characters)",
      "interaction": "click, clear, type title"
    },

    "keywords_textarea": {
      "description": "Keywords textarea (min 5, max 49)",
      "trigger_required": true,
      "trigger_action": "click on any image thumbnail",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_aria": "keywords input or textarea",
      "interaction": "click, clear, type comma-separated keywords"
    },

    "file_info_text": {
      "description": "File ID(s) and Original name(s) text block below keywords",
      "trigger_required": true,
      "trigger_action": "click on any image thumbnail",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "interaction": "read-only — used to extract original filename for sidecar matching"
    },

    "save_work_button": {
      "description": "Save work button (saves metadata without submitting)",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "fallback_text_match": "Save work",
      "interaction": "click after filling all fields for current image"
    },

    "suggest_keywords_button": {
      "description": "Suggest keywords action button",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "fallback_text_match": "Suggest keywords",
      "interaction": "NOT used by this agent — present for reference only"
    },

    "erase_all_keywords_button": {
      "description": "Erase all keywords action button",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "fallback_text_match": "Erase all keywords",
      "interaction": "click to clear all keywords before entering new ones"
    },

    "refresh_auto_category_button": {
      "description": "Refresh auto-category action button",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "fallback_text_match": "Refresh auto-category",
      "interaction": "NOT used by this agent — category is set manually"
    },

    "pagination_next": {
      "description": "Next page button in bottom pagination",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "fallback_aria": "aria-label contains 'next' or 'Next page'",
      "interaction": "click to move to next page of upload queue"
    },

    "submit_files_button": {
      "description": "Submit files button (top right) — DO NOT CLICK",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "fallback_text_match": "Submit",
      "interaction": "⚠ NEVER click this — user submits manually after reviewing all images"
    }
  }
}
```

### Selector Stability Priority (same as file 01_TREND_RESEARCH_AND_IMAGE_CREATION.md)

```
1. data-t attribute             → most stable (Adobe Stock uses these for testing)
2. input[name="..."]            → stable for form inputs
3. id attribute                 → stable if semantic
4. aria-label / role            → stable for accessibility-first elements
5. Placeholder / text match     → fallback only
6. NEVER use: auto-generated hash classes
```

---

## PART 3 — MAIN WORKFLOW

### Starting Point

```
Navigate to: https://contributor.stock.adobe.com/en/uploads
Default sort: Upload date (newest first) — leave as-is
Work through ALL images across ALL pages before stopping
```

### Page-by-Page Loop

```
FOR EACH page in the upload queue:

  FOR EACH image on the current page:
    → Perform the full per-image workflow (Section 3.1)

  WHEN all images on current page are done:
    → Click the pagination "Next" button at the bottom
    → Wait for next page to load (DOM stable)
    → Continue with next page's images

  WHEN no "Next" button exists (last page):
    → Session complete
    → Log: "All pages processed. [N] images prepared. [N] automated. [N] manual."
    → EXIT
```

---

### 3.1 — Per-Image Workflow

```
FOR EACH image:

STEP 1 — SELECT THE IMAGE
  → Click on the image thumbnail in the grid
  → Wait for right panel to update (DOM settle, ~500ms)
  → Verify: right panel shows the correct image

STEP 2 — READ THE ORIGINAL FILENAME
  → Find the file info text block at the bottom of the right panel
  → Read: "File ID(s): XXXXXXXXX - Original name(s): [filename]"
  → Extract the original filename (e.g., ai_finance_16A_establishing_L1_001_20260323.png)

STEP 3 — DETERMINE IMAGE TYPE via image_registry.json
  → Load image_registry.json (C:\AdobeStockAutomation\data\image_registry.json)
  → Look up the filename (without extension) as a key in the registry
  → If registry entry EXISTS:
      → Read "upscaled_path" from registry entry
      → Locate sidecar: [upscaled_path_dir]\[filename_without_ext].metadata.json
      → Load sidecar → read "status" field:
          "ready_for_upload"             → TYPE A (complete sidecar) → follow Section 3.2
          "stub_created_pending_review"  → TYPE B (stub sidecar, manual image) → follow Section 3.3
  → If registry entry DOES NOT EXIST:
      → Image was uploaded outside the automation system (old manual upload)
      → Treat as TYPE B → follow Section 3.3 (visual analysis, no sidecar available)
```

---

### 3.2 — TYPE A: Automated Image (Sidecar Found)

```
STEP 1 — LOAD SIDECAR
  → Read [image_basename].metadata.json
  → Load all fields into memory

STEP 2 — VISUAL SANITY CHECK (5 seconds max)
  → Look at the image thumbnail in the panel
  → Confirm it roughly matches the series_slot description:
    16A (establishing) → should be a wide scene with full environment
    16B (close-up)     → should be a tight detail shot, not a wide scene
    16C (overhead)     → should be a top-down perspective
    16D (mood variant) → should show a different demographic or mood vs 16A
    1A  (portrait)     → should be a centered subject in square frame
    1B  (extreme CU)   → should be very tight, fills the frame
    1C  (flat-lay)     → should be overhead lifestyle objects arrangement
    1D  (demo variant) → should show different demographic vs 1A
  → If the image broadly matches → proceed to STEP 3
  → If obvious mismatch detected:
      LOG: "Sanity check FAILED for [filename]. Series slot [slot] mismatch."
      Flag image in session_state as "needs_manual_review"
      Skip this image → move to next

STEP 3 — APPLY ALL METADATA FIELDS (in this exact order)

  3a. FILE TYPE
      → Read: sidecar.adobe_stock_metadata.file_type
      → Set the File type dropdown to that value (Photos or Illustrations)
      → Use fastClick or select element interaction

  3b. CATEGORY
      → Read: sidecar.adobe_stock_metadata.category
      → Set the Category dropdown to that value
      → See full category list in Section 4 below

  3c. LANGUAGE CHECK
      → Verify the language selector shows "English"
      → If not English → change it to English
      → If already English → leave it (do NOT re-click, leave default alone)

  3d. AI GENERATED CHECKBOX
      → Check if "Created using generative AI tools" checkbox is already checked
      → If NOT checked → click it to check it
      → Wait 500ms for the "People and Property are fictional" checkbox to appear below it
      → If already checked → verify the fictional checkbox also appeared below

  3e. PEOPLE AND PROPERTY ARE FICTIONAL CHECKBOX
      → This appears below the AI checkbox after it is checked
      → Check if it is already checked
      → If NOT checked → click it to check it
      → Wait 300ms → verify the "Recognizable people or property?" Yes/No selector has disappeared
      → If already checked → verify the Yes/No selector is not visible

  3f. TITLE
      → Click the title textarea to focus it
      → Select all (Ctrl+A) → Delete any existing text
      → Type the title from: sidecar.adobe_stock_metadata.title
      → Verify: character count does not exceed 200
      → Verify: text appears correctly in the field

  3g. KEYWORDS
      → Click "Erase all keywords" button (clears any existing keywords)
      → Wait 300ms
      → Click the keywords textarea to focus it
      → Type all keywords from: sidecar.adobe_stock_metadata.keywords
      → Format: comma-separated, e.g., "AI financial analysis, diverse team, fintech"
      → Verify: keyword count is between 5 and 49
      → Verify: keywords appear in the field

STEP 4 — SAVE
  → Click the "Save work" button
  → Wait for save confirmation (button state change or success indicator)
  → DO NOT click "Submit files" — user submits manually
  → Log: "Saved: [filename] — [series_slot] — TYPE A"

STEP 5 — UPDATE SIDECAR
  → Set sidecar field "applied_to_adobe_stock": true
  → Write updated sidecar back to disk

STEP 6 — MOVE TO NEXT IMAGE
```

---

### 3.3 — TYPE B: Previously Uploaded Image (No Sidecar)

```
STEP 1 — READ CURRENT METADATA
  → Read the current state of every field in the right panel:
    - File type (current value)
    - Category (current value)
    - AI generated checkbox (checked or not)
    - People fictional checkbox (checked or not)
    - Title (current text)
    - Keywords (current text / count)

STEP 2 — EVALUATE AGAINST STOCK_SUCCESS_REPORT.md STANDARDS

  For each field, determine if it meets the standard:

  TITLE evaluation:
    ✓ PASS if: under 70 characters, has primary subject + context + differentiator,
      reads naturally, no clichés ("stock photo of", "beautiful", "amazing")
    ✗ FAIL if: generic, empty, over 70 chars, keyword-stuffed, or vague

  KEYWORDS evaluation:
    ✓ PASS if: 20–35 keywords present, first 7–10 are specific buyer-intent phrases,
      mix of subject/action/setting/mood/industry/use-case keywords
    ✗ FAIL if: fewer than 20 keywords, or first slots used for single generic words,
      or keywords don't match the image content

  CATEGORY evaluation:
    ✓ PASS if: most specific relevant category is selected (not a parent/generic category)
    ✗ FAIL if: wrong category, generic parent category, or clearly mismatched

  AI CHECKBOX evaluation:
    ✓ PASS if: checked for AI-generated images, unchecked for real photographs
    ✗ FAIL if: AI image has the box unchecked, or real photo has it checked

  OVERALL RESULT:
    If ALL fields PASS → leave COMPLETELY UNTOUCHED → move to next image
    If ANY field FAILS → rewrite/complete all weak fields as described in STEP 3

STEP 3 — REWRITE / COMPLETE WEAK FIELDS

  Only touch fields that failed evaluation.
  Fields that passed → leave exactly as they are.

  TITLE (if failing):
    → Visually analyse the image content (subject, setting, mood, industry)
    → Write a new title following STOCK_SUCCESS_REPORT.md Chapter 4.1 rules:
      Under 70 chars, lead with primary subject, include context + differentiator
    → Clear existing title → type new title

  KEYWORDS (if failing):
    → Click "Erase all keywords" to clear all existing keywords
    → Write 25–35 keywords following the 35-slot blueprint (Chapter 4.2):
      Slots 1–7: specific buyer-intent phrases
      Slots 8–12: descriptive (setting, action, mood)
      Slots 13–20: conceptual (industry, emotion, abstract)
      Slots 21–28: technical (composition, color, format)
      Slots 29–35: use-case and industry tags
    → Type all keywords comma-separated into the keywords field

  CATEGORY (if failing):
    → Determine the most specific correct category for the image
    → Set the category dropdown to that value

  AI CHECKBOX (if failing):
    → If image is AI-generated → check the AI checkbox + the fictional checkbox
    → If image is a real photo → ensure both checkboxes are unchecked

STEP 4 — SAVE
  → Click "Save work" button
  → Wait for save confirmation
  → DO NOT click "Submit files"
  → Log: "Saved: [filename] — TYPE B — fields updated: [list of changed fields]"
  → If no changes were made: Log: "Skipped: [filename] — TYPE B — already optimal"

STEP 5 — MOVE TO NEXT IMAGE
```

---

## PART 4 — CATEGORY LIST (Full Reference)

Adobe Stock has a fixed category list. Always choose the most specific applicable category. The full list available in the dropdown:

```
Animals
Buildings and Architecture
Business
Drinks
The Environment
States of Mind
Food
Graphic Resources
Hobbies and Leisure
Industry
Landscapes
Lifestyle
People
Plants and Flowers
Culture and Religion
Science
Social Issues
Sports
Technology
Transport
Travel
```

**Category selection guide:**

| Image Content | Best Category |
|---|---|
| AI, computers, data, robots, interfaces | Technology |
| Finance, meetings, offices, corporate | Business |
| Portraits, diverse people, lifestyle scenes | People or Lifestyle |
| Healthcare, medical, mental health | Science or Social Issues |
| Nature, forests, oceans, wildlife | Landscapes or Animals |
| Food styling, cuisine, drinks | Food or Drinks |
| Architecture, cityscapes, buildings | Buildings and Architecture |
| Sustainability, environment, climate | The Environment |
| Sports, exercise, outdoor activity | Sports or Hobbies and Leisure |
| Seasonal, cultural, religious themes | Culture and Religion |
| Travel destinations, tourism | Travel |
| Abstract, conceptual, artistic | Graphic Resources |

---

## PART 5 — FIELD INTERACTION DETAILS

### File Type Dropdown

```
Options: Photos, Illustrations
Default: Photos

For automated (TYPE A) images:
  → Use the value from sidecar.adobe_stock_metadata.file_type

For manual (TYPE B) images:
  → Photos: use for photorealistic images (including AI-generated photorealistic)
  → Illustrations: use for clearly illustrated, painterly, or drawn style images

Interaction:
  → Locate the <select> element
  → Set its value using JavaScript: selectEl.value = "Photos"
  → OR click the select → find and click the correct <option>
  → Verify: the correct value is shown after interaction
```

### AI Generated Checkbox — Interaction Sequence

```
The two AI checkboxes have a parent-child relationship:
  Checkbox 1 (ai_generated): check this FIRST
  Checkbox 2 (people_fictional): appears AFTER Checkbox 1 is checked

ALWAYS check both for TYPE A images (all Flow-generated images are AI).

Interaction:
  1. Locate Checkbox 1 by: input[name="content-tagger-generative-ai-checkbox"]
  2. Check if it is already checked: el.checked === true
  3. If NOT checked → click it → wait 500ms
  4. Locate Checkbox 2 by: input[name="content-tagger-generative-ai-property-release-checkbox"]
     (This element only exists in DOM after Checkbox 1 is checked)
  5. Check if Checkbox 2 is already checked
  6. If NOT checked → click it → wait 300ms
  7. Verify: the "Recognizable people or property?" Yes/No toggle is NO LONGER VISIBLE
     (checking Checkbox 2 causes it to disappear)
```

### Title Textarea

```
Selector: textarea with placeholder "Type title here (max: 200 characters)"
Max length: 200 characters (Adobe Stock limit)
Our standard: under 70 characters (for external SEO + readability)

Interaction:
  1. Click the textarea to focus
  2. Ctrl+A to select all existing text
  3. Delete to clear
  4. Type the new title text (delay:0 for speed)
  5. Verify: textarea contains correct text
```

### Keywords Textarea

```
Min: 5 keywords | Max: 49 keywords
Our standard: 25–35 keywords

Format: comma-separated, no line breaks
Example: "AI financial analysis, diverse team, fintech, business technology, ..."

Interaction:
  1. Click "Erase all keywords" button first (clears existing keywords cleanly)
  2. Wait 300ms for clear to complete
  3. Click the keywords textarea to focus
  4. Type all keywords as one comma-separated string (delay:0)
  5. Verify: keyword count shown in UI matches expected count (min 5, max 49)
  6. If count exceeds 49 → remove keywords from the end until count ≤ 49
```

### Save Work Button

```
Selector: button with text "Save work" (visible at bottom left of the page, fixed position)
Interaction: click once
After click: wait for visual confirmation (button briefly changes state or a toast appears)
DO NOT proceed to next image until save is confirmed
```

---

## PART 6 — WORKFLOW DECISION TREE

```
Image selected from grid
       │
       ▼
Read filename from "File ID(s): ... Original name(s): [filename]"
       │
       ▼
Does [filename].metadata.json sidecar exist?
       │
  ┌────┴──────┐
  YES         NO
  │           │
  ▼           ▼
TYPE A      TYPE B
(Sidecar)   (Manual)
  │           │
  ▼           ▼
Load       Read all
sidecar    current fields
  │           │
  ▼           ▼
Visual     Evaluate against
sanity     STOCK_SUCCESS_REPORT
check      standards
(5 sec)       │
  │       ┌───┴───┐
  │       ALL     ANY
  │       PASS    FAIL
  │       │       │
  │       ▼       ▼
  │     SKIP    Rewrite
  │     image   failing
  │     untouched fields
  │           │
  ▼           ▼
Apply all   Apply
sidecar    rewritten
fields     fields
  │           │
  └─────┬─────┘
        ▼
   Click "Save work"
   Wait for confirmation
   Log result
   Update sidecar (TYPE A only)
        │
        ▼
   Next image
```

---

## PART 7 — IMPORTANT RULES

```
⚠ NEVER click "Submit files" — the green button in the top right.
   User reviews and submits manually. This agent only prepares images.

⚠ NEVER change any field that already meets the standard on TYPE B images.
   If a field is already good → leave it completely untouched.

⚠ NEVER skip the "Save work" step after completing any image.
   Unsaved work is lost if the browser refreshes or the session ends.

⚠ Language selector: Always verify English is selected.
   Adobe Stock pre-selects English by default — only change it if something else is shown.

⚠ Keyword count: Adobe Stock enforces a hard maximum of 49 keywords.
   Our sidecar files contain 25–35. Never exceed 49 when typing into the field.

⚠ Work page by page using the bottom pagination.
   Do not try to process all images on all pages at once.
   Complete every image on the current page → click Next → repeat.

⚠ Never process an image marked "In review", "Not accepted", or "Releases" tab.
   This agent only works on the "New" tab (the default upload queue).
   Verify the "New" tab is active at the start of the session.
```

---

## PART 8 — SESSION STATE

```json
{
  "session_date": "YYYY-MM-DD",
  "target_url": "https://contributor.stock.adobe.com/en/uploads",
  "current_page": 1,
  "current_image_index": 0,
  "images_processed": 0,
  "images_type_a": 0,
  "images_type_b_updated": 0,
  "images_type_b_skipped": 0,
  "images_flagged_for_manual_review": [],
  "errors": []
}
```

---

## PART 9 — ERROR HANDLING

| Error Type | Detection | Recovery |
|---|---|---|
| Right panel not loading | Panel container not in DOM after 3s | Re-click image thumbnail → retry |
| Sidecar file not found | File read returns null | Treat as TYPE B → evaluate manually |
| Title too long | Character count > 200 | Truncate to 70 chars at last word boundary |
| Keywords over 49 | UI counter shows > 49 | Remove from end of list until ≤ 49 |
| Save not confirming | No state change after 3s | Retry click → wait 3s → retry once more |
| AI checkbox not appearing after check | Checkbox 2 not in DOM | Wait 1s → re-check Checkbox 1 → retry |
| Pagination next not found | Next button absent | This is the last page → session complete |
| Selector not found (cached) | querySelector returns null | Re-discover that specific selector → update adobe_stock_selectors.json |

### Retry Policy

```
max_retries: 3
retry_delay_base: 2 seconds (exponential: 2s → 4s → 8s)

After 3 retries on any action:
  → Log error to logs\automation.log
  → Skip current image → flag for manual review
  → Continue with next image
  → Never let a single failure halt the entire session
```

---

## PART 10 — SESSION SUMMARY LOG

At the end of every session, write to:
```
PROJECT_ROOT\logs\automation.log
```

Contents:
```
Session: [date/time]
Report loaded: confirmed
Total images processed: [N]
  TYPE A (automated/sidecar): [N] — all applied successfully
  TYPE B (manual — updated):  [N] — fields rewritten
  TYPE B (manual — skipped):  [N] — already optimal, left untouched
  Flagged for manual review:  [N] — [list of filenames]
Pages processed: [N]
Errors: [N] — see details below
[error details]
```

---

*03_METADATA_OPTIMIZER.md END*
*Previous: instructions\02_IMAGE_UPSCALER.md*
*This file completes the Adobe Stock Automation System (3 of 3).*
*Final step: User reviews prepared images on Adobe Stock and clicks Submit.*
