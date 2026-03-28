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

Target URL:

```text
https://contributor.stock.adobe.com/en/uploads
```

---

## BROWSER RULES

Use the shared browser automation core:

```text
C:\Users\11\browser-automation-core\
```

Launch through:

```text
C:\Users\11\browser-automation-core\launch_browser.bat 9222 AdobeStockProfile
```

Selector stability order:

1. `data-t`
2. semantic `name`
3. semantic `id`
4. `aria-label` or role
5. placeholder or text match
6. never rely on generated hash classes

Cache discovered selectors in `adobe_stock_selectors.json`.

---

## IMAGE TYPES

### Type A - automated images

- created by `02_IMAGE_CREATION.md`
- upscaled by `03_IMAGE_UPSCALER.md`
- already have a complete sidecar
- require a quick sanity check, then direct field application

### Type B - manual images

- were added manually and stubbed by `03_IMAGE_UPSCALER.md`
- sidecar status is `stub_created_pending_review`
- require full visual analysis and a metadata rewrite before applying

---

## HOW TO FIND THE SIDECAR

For each Adobe Stock item:

1. click the item
2. read the `Original name(s)` value from the right panel
3. look up the filename in `image_registry.json`
4. read `upscaled_path`
5. load `[same_name].metadata.json` from the same folder

Interpret status:

- `ready_for_upload` -> Type A
- `stub_created_pending_review` -> Type B
- missing registry or sidecar -> treat as Type B and rebuild metadata from visual review

---

## PAGE LOOP

Process every upload page until there is no next page:

```text
for each page:
  for each image on the page:
    run the per-image workflow
  go to the next page if it exists
```

Do not click the final submit button. The user submits manually after review.

---

## PER-IMAGE WORKFLOW

### 1. Select and identify

- click the thumbnail
- wait for the right panel to update
- read the original filename

### 2. Determine type

- locate registry entry
- load sidecar
- branch to Type A or Type B

### 3. Type A workflow

- load metadata from sidecar
- perform a quick visual sanity check
- if metadata is still appropriate, apply it directly
- if the asset clearly mismatches the sidecar, rewrite only the mismatched fields

### 4. Type B workflow

- visually inspect the image
- write a clean title
- build the keyword set
- choose category
- decide file type
- decide AI/disclosure flags based on the actual image
- save the improved metadata back to the sidecar before applying it

---

## FIELD RULES

### File type

- use `Photos` for photorealistic work
- use `Illustrations` for obviously illustrated or drawn work

### AI disclosure

For Type A Flow-generated images:

- check `AI generated`
- then check `Recognizable people or property are fictional`

Always apply the first checkbox before the second one.

### Title

- under 70 characters preferred
- buyer-search style, not a sentence
- lead with subject and commercial meaning

### Keywords

- follow the 35-keyword blueprint
- front-load the strongest terms
- remove filler, duplicates, and weak adjectives

### Category

Choose the single best Adobe Stock category from the platform dropdown. Prefer specificity over generic choices.

---

## SAVE AND STATUS UPDATE

After fields are applied:

1. click Save
2. verify the save completed
3. update sidecar status if appropriate
4. update registry or Adobe status if your runtime uses it
5. continue to the next image

Write a session summary to the log:

```text
[N] prepared
[N] automated
[N] manual
[N] rewritten
[N] failed
```

---

## SUCCESS CRITERIA

This file is complete when:

- every upload item across every page has been processed
- Type A images had sidecars applied correctly
- Type B images received rewritten metadata before apply
- all changes were saved
- the queue is ready for manual human review and submit
