# 04_METADATA_OPTIMIZER.md
## Adobe Stock Automation System · Execution File 4

---

## PURPOSE

Open Adobe Stock upload items, verify the metadata that should already be prefilled from embedded XMP, apply the Adobe-only finish fields, and save the item in a ready-to-review state.

This file is the final pipeline stage. It applies or edits metadata; it does not generate new images.

Default behavior:

- always **check first**
- if the current Adobe metadata is already strong and aligned -> keep it and log that it passed
- if the current Adobe metadata is weak, missing, or mismatched -> rewrite only the failing fields
- for pipeline images, title and keywords should normally already be prefilled from XMP written during File 03

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
PROJECT_ROOT\data\adobe_outside_system\
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

Run the launcher with no extra arguments. Do not append a custom port, profile, or URL.

Command-first entry:

```text
Check only: npx --yes tsx PROJECT_ROOT\scripts\adobe_runtime.ts --action=check --date=YYYY-MM-DD
Apply pass: npx --yes tsx PROJECT_ROOT\scripts\adobe_runtime.ts --action=apply --date=YYYY-MM-DD
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

## SUB-AGENT SYSTEM

Keep this file mostly single-controller because Adobe page state is fragile and should not be clicked by multiple agents at once.

- **Controller Agent**
  Owns thumbnail selection, sidecar lookup, field application, save confirmation, and pagination.
- **Optional Helper Agent — Outside-System Draft**
Used only for outside-system uploads. It may draft metadata from the selected image, but the Controller Agent must still create the sidecar, update registry state, and apply or overwrite the fields.

Rule:

- do not split live Adobe interactions across multiple agents
- only use the helper for outside-system fallback when it improves speed or metadata quality

## MANDATORY PLANNER / GENERATOR / EVALUATOR LOOP

This file must also use Planner -> Generator -> Evaluator, but with one controller owning the live Adobe page.

- **Planner**
  reads this file fully and extracts browser setup, sidecar lookup, pipeline apply rules, outside-system fallback rules, field constraints, save behavior, and error handling
- **Generator**
  performs the real Adobe interactions: thumbnail selection, sidecar lookup, field application, save confirmation, pagination, and fallback rebuilds when needed
- **Evaluator**
  checks that:
  - sidecars were applied exactly where available
  - outside-system uploads were rebuilt only when truly necessary
  - titles, keywords, categories, and AI disclosure comply with the success report
  - save confirmation occurred before the item was considered complete
  - page state remained stable and no item was silently skipped

Because live Adobe UI state is fragile, the Evaluator should critique and send corrections back to the same controller rather than clicking independently unless the optional helper is explicitly used for outside-system draft generation.

---

## IMAGE TYPES

**All images that went through the automation pipeline** — both AI-generated and manual — arrive in File 04 with a complete sidecar (`status: ready_for_upload`) and should already have XMP title/keywords embedded in the final image. File 03 generates full metadata for manual images during its scan phase and then embeds XMP after upscale. File 04 is mostly a verifier + finish-field applier for these images.

**Exception: images uploaded outside the automation system** (uploaded directly to Adobe Stock without going through this pipeline) have no registry entry, no sidecar, or both. These are handled as a fallback case only.

Outside-system rule:

- do not assume the Adobe fields are blank
- read the current Adobe title, keywords, category, and disclosure state
- inspect the image visually
- if the current Adobe metadata is weak, generic, mismatched, or incomplete, overwrite it
- File 04 must be able to check, add, edit, replace, erase, or improve Adobe metadata fields the same way a human editor can
- if the outside-system upload already has strong metadata, keep it, capture it into a sidecar under `data\adobe_outside_system\`, and log it as a passed check instead of rewriting it blindly

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

- `ready_for_upload` → sidecar is complete — apply directly after sanity check
- `analysis_failed` → visual analysis failed during File 03 — flag for manual review, skip
- missing registry entry or missing sidecar → uploaded outside the pipeline — see Fallback Workflow below

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

### Step 2 — Check current Adobe state first

Before changing anything:

1. Read the current Adobe title
2. Read the current Adobe keywords
3. Read the current category and file type
4. Read the AI disclosure state
5. Compare the current Adobe metadata against:
   - the selected image visual
   - the sidecar if one exists
   - the success report quality rules

Decision:

- if metadata is already strong and aligned -> mark `checked_passed`
- if metadata is weak, generic, incomplete, or mismatched -> continue to rewrite the failing fields only

### Step 3 — Determine path

Load registry entry → load sidecar → read `status`.

- if registry + sidecar exist and `status: ready_for_upload` -> use pipeline apply workflow
- if sidecar says `analysis_failed` -> skip and flag for manual review
- if registry or sidecar is missing -> use outside-system fallback workflow

### Step 4A — Pipeline apply workflow

1. Load all metadata from sidecar
2. Check whether the current Adobe fields already match the sidecar strongly.
3. Visual sanity check (5 seconds): does the image roughly match the `series_slot` description and the prefilled Adobe title/keywords?
4. If the current Adobe fields already match and quality is strong -> log `checked_passed`, do not rewrite blindly.
5. If fields are weak or mismatched -> rewrite only the failing fields and click Save.

Strong sidecar rule:

- File 04 must not trust a pipeline sidecar just because it exists
- if the sidecar has fewer than 20 keywords, weak generic wording, or misses clear composition details like top view, close-up, portrait, hand holding, card text, tablet, eye detail, or server-rack context, treat it as weak and rebuild/fix it before apply
- if Adobe already shows strong prefilled title/keywords from XMP and they align with the sidecar and image, keep them

### Step 4B — Outside-system fallback workflow

1. Visually inspect the image fully
2. Read the current Adobe metadata and score it against the visual.
3. If the current metadata is already strong, keep it, capture it into a local sidecar, and mark the image `checked_passed`.
4. If the current metadata is weak, generate the complete improved metadata from the image itself using the success report rules.
5. Create or update a local sidecar and registry entry so this image is brought back into the automation system.
6. Evaluate generated or retained fields against success report standards:
- **Title**: pass if under 70 chars, has subject + context + differentiator, reads naturally. Fail if empty, generic, keyword-stuffed, or over 70 chars.
- **Keywords**: pass if 20–35 present and first 7–10 are specific buyer-intent phrases. Fail if fewer than 20, or first slots have single generic words.
- **Category**: pass if most specific applicable category is selected. Fail if wrong or generic.
- **AI checkbox**: pass if correctly matches actual image source. Fail if AI image has box unchecked.
7. If all fields pass -> keep the current/generated metadata and continue
8. If any field fails -> rewrite only the failing fields using success report standards
9. Save the completed metadata back to the sidecar before applying
10. Apply all fields only when the Adobe item needs improvement; do not rewrite a strong item just for the sake of rewriting

---

## FIELD RULES

### Language

Verify the language selector shows "English". Adobe Stock pre-selects English by default. Only change it if something else is shown.

### File type

- `Photos` for photorealistic work (including AI-generated photorealistic)
- `Illustrations` for clearly illustrated or drawn style

### AI disclosure

The two checkboxes have a parent-child relationship. Always apply in order:

1. Locate `input[name="content-tagger-generative-ai-checkbox"]`
2. Set it only if the current value is wrong
3. Locate `input[name="content-tagger-generative-ai-property-release-checkbox"]` — this element only appears in DOM after the first checkbox is checked
4. Set it only if the current value is wrong
5. Verify: the "Recognizable people or property?" Yes/No toggle is no longer visible when the fictional box should be active

### Title

- under 70 characters preferred; Adobe Stock limit is 200
- buyer-search style, not a sentence
- lead with subject and commercial meaning
- no "stock photo of", "image of", "AI generated"
- for pipeline images, do not erase and retype the title if the XMP-prefilled title is already correct

Interaction: click title textarea → Ctrl+A → Delete → type new title at delay:0

### Keywords

- for pipeline images, do not erase and retype keywords if the XMP-prefilled set is already strong and aligned

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
4. Update sidecar `applied_to_adobe_stock: true`
5. Log result

Write session summary to log:

```text
[N] checked | [N] updated from sidecar | [N] rebuilt outside-system uploads | [N] skipped | [N] failed
```

---

## ERROR HANDLING

| Error | Recovery |
|---|---|
| Right panel not loading after 3s | Re-click thumbnail → retry |
| Sidecar not found | Treat as outside-system upload -> visual rebuild + create sidecar |
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
- pipeline images had sidecars applied correctly
- outside-system uploads were rebuilt into the system before apply
- all changes were saved
- the queue is ready for manual human review and submit
