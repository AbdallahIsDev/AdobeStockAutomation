# 04_METADATA_OPTIMIZER.md
## Adobe Stock Automation System · Execution File 4

---

## PURPOSE

Open Adobe Stock upload items, locate each image's sidecar, apply the metadata fields, and save the item in a ready-to-review state.

This file is the final pipeline stage. It applies metadata; it does not generate new images.

---

## SUCCESS REPORT PREREQUISITE

This file assumes `SKILL.md` already forced a full read of:

`PROJECT_ROOT\instructions\STOCK_SUCCESS_REPORT.md`

The full report must be loaded into active memory before this file runs.

---

## REQUIRED FILES

```text
PROJECT_ROOT\data\image_registry.json
PROJECT_ROOT\data\adobe_stock_selectors.json
PROJECT_ROOT\logs\automation.log
PROJECT_ROOT\downloads\upscaled\
C:\Users\11\browser-automation-core\launch_browser.bat
```

Target URL: `https://contributor.stock.adobe.com/en/uploads`

Work on the **"New" tab only.** Never process items under "In review", "Not accepted", or "Releases" tabs. Verify the "New" tab is active at session start.

---

## BROWSER SETUP

```text
Launch: C:\Users\11\browser-automation-core\launch_browser.bat
Connect: connectBrowser(9222) via browser_core.ts
If port 9222 is already ready -> skip launch, connect directly
```

Selector stability order: `data-t` → semantic `name` → semantic `id` → `aria-label` or role → placeholder or text match. Never rely on generated hash classes.

Cache discovered selectors in `adobe_stock_selectors.json`. Re-discover only when a cached selector fails in action.

Most right-panel elements only appear in the DOM after clicking an image thumbnail. Always trigger the thumbnail click first, wait for the panel to update, then interact with panel fields.

Known critical selectors (use as-is; do not rely on label text or position):

```text
AI generated checkbox:         input[name="content-tagger-generative-ai-checkbox"]
People/property fictional:     input[name="content-tagger-generative-ai-property-release-checkbox"]
Recognizable people Yes:       input[data-t="has-release-yes"]
Recognizable people No:        input[data-t="has-release-no"]
```

---

## IMAGE TYPES

### Type A — automated images

- created by `02_IMAGE_CREATION.md`, upscaled by `03_IMAGE_UPSCALER.md`
- already have a complete sidecar (`status: ready_for_upload`)
- require a quick 5-second visual sanity check, then direct field application

### Type B — manual images

- bootstrapped by `03_IMAGE_UPSCALER.md` (`status: pending_auto_metadata_generation`)
- or not in registry at all (uploaded outside the automation system)
- require full visual analysis and automatic metadata generation before applying

---

## HOW TO FIND THE SIDECAR

Adobe Stock shows at the bottom of the right panel: `File ID(s): XXXXXXX - Original name(s): [filename]`

```text
1. Read the original filename from that text
2. Look up the filename in image_registry.json
3. Read the upscaled_path field
4. Load [same_name].metadata.json from the same folder
```

Status interpretation:

- `ready_for_upload` → Type A
- `pending_auto_metadata_generation` → Type B
- missing registry or sidecar → treat as Type B and rebuild from visual inspection

---

## PAGE LOOP

```text
for each page in the upload queue:
  for each image on the page:
    run per-image workflow below
  click Next page if it exists
stop when no Next page is found
```

**Never click the "Submit files" button.** The user submits manually after reviewing.

---

## PER-IMAGE WORKFLOW

### Step 1 — Select and identify

Click the thumbnail. Wait for right panel to update. Read `Original name(s)` from the file info block at the bottom of the panel.

### Step 2 — Determine type

Load registry entry → load sidecar → read `status` → branch to Type A or Type B.

### Step 3A — Type A workflow

1. Load all metadata from sidecar
2. Visual sanity check (5 seconds): does the image roughly match the `series_slot` description? If obvious mismatch, rewrite only the mismatched fields and flag the image.
3. Apply all fields (see Field Rules below)
4. Click Save

### Step 3B — Type B workflow

1. Visually inspect the image fully
2. Generate the complete metadata from the image itself. The user does not supply manual metadata for this path.
3. Evaluate generated fields against success report standards:
- **Title**: pass if under 70 chars, has subject + context + differentiator, reads naturally. Fail if empty, generic, keyword-stuffed, or over 70 chars.
- **Keywords**: pass if 20–35 present and first 7–10 are specific buyer-intent phrases. Fail if fewer than 20, or first slots have single generic words.
- **Category**: pass if most specific applicable category is selected. Fail if wrong or generic.
- **AI checkbox**: pass if correctly matches actual image source. Fail if AI image has box unchecked.
4. If all fields pass → keep the generated metadata and continue
5. If any field fails → rewrite only the failing fields using success report standards
6. Save the completed metadata back to the sidecar before applying
7. Apply all fields

---

## FIELD RULES

### Language

Verify the language selector shows "English". Adobe Stock pre-selects English by default. Only change it if something else is shown.

### File type

- `Photos` for photorealistic work (including AI-generated photorealistic)
- `Illustrations` for clearly illustrated or drawn style

### AI disclosure (Type A always; Type B based on actual image)

The two checkboxes have a parent-child relationship. Always apply in order:

1. Locate `input[name="content-tagger-generative-ai-checkbox"]`
2. If not checked → click it → wait 500ms
3. Locate `input[name="content-tagger-generative-ai-property-release-checkbox"]` — this element only appears in DOM after the first checkbox is checked
4. If not checked → click it → wait 300ms
5. Verify: the "Recognizable people or property?" Yes/No toggle is no longer visible (checking the fictional box causes it to disappear)

### Title

- under 70 characters preferred; Adobe Stock limit is 200
- buyer-search style, not a sentence
- lead with subject and commercial meaning
- no "stock photo of", "image of", "AI generated"

Interaction: click title textarea → Ctrl+A → Delete → type new title at delay:0

### Keywords

- follow the 35-keyword blueprint from the success report
- front-load the strongest buyer-intent terms in slots 1–10
- remove filler, duplicates, and weak adjectives
- our standard: 25–35 keywords; Adobe Stock enforces a hard max of 49

Interaction: click "Erase all keywords" button first → wait 300ms → click keywords textarea → type all keywords as one comma-separated string at delay:0 → verify count is between 5 and 49

### Category

Choose the single most specific applicable category. Available categories:

```text
Animals | Buildings and Architecture | Business | Drinks | The Environment |
States of Mind | Food | Graphic Resources | Hobbies and Leisure | Industry |
Landscapes | Lifestyle | People | Plants and Flowers | Culture and Religion |
Science | Social Issues | Sports | Technology | Transport | Travel
```

---

## SAVE AND STATUS UPDATE

1. Click "Save work" button (bottom-left of the page, fixed position)
2. Wait for save confirmation (button state change or toast)
3. Do not proceed until save is confirmed
4. Update sidecar `applied_to_adobe_stock: true` for Type A images
5. Log result

Write session summary to log:

```text
[N] prepared | [N] automated (Type A) | [N] manual updated (Type B) | [N] manual skipped | [N] failed
```

---

## ERROR HANDLING

| Error | Recovery |
|---|---|
| Right panel not loading after 3s | Re-click thumbnail → retry |
| Sidecar not found | Treat as Type B → visual rebuild |
| Title over 200 chars | Truncate to 70 at last word boundary |
| Keywords over 49 | Remove from end until ≤ 49 |
| Save not confirming after 3s | Retry click once more; if still fails, log + skip |
| AI checkbox 2 not in DOM | Wait 1s → re-check checkbox 1 → retry |
| No next page button | Last page reached → session complete |
| Cached selector fails | Re-discover that specific selector → update `adobe_stock_selectors.json` |

Retry policy: max 3 attempts per action, backoff 2s → 4s → 8s. Flag and skip after 3 failures; never halt the session.

---

## SUCCESS CRITERIA

This file is complete when:

- every upload item on every page has been processed
- Type A images had sidecars applied correctly
- Type B images received auto-generated complete metadata before apply
- all changes were saved
- the queue is ready for manual human review and submit
