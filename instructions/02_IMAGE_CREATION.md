# 02_IMAGE_CREATION.md
## Adobe Stock Automation System · Execution File 2

---

## PURPOSE

Convert ranked trends into image-prompt series, create the images in Google Flow, download each successful render, and write a `.metadata.json` sidecar next to every downloaded image.

This file owns:

- description generation
- Flow browser automation
- rolling generation/download/upscale trigger loop
- active-session multi-batch tracking
- rate-limit handling
- account switching
- metadata sidecar creation
- strict AI sidecar generation from prompt + trend context only
- handoff metadata source for File 03 XMP embedding

---

## SUCCESS REPORT PREREQUISITE

This file assumes `SKILL.md` already forced a full read of:

`PROJECT_ROOT\instructions\STOCK_SUCCESS_REPORT.md`

The full report must be loaded into active memory before this file runs.

If this file is invoked directly without `SKILL.md`, read the full success report first, load it into memory, then continue.

---

## REQUIRED FILES

```text
PROJECT_ROOT\data\trend_data.json
PROJECT_ROOT\data\descriptions.json
PROJECT_ROOT\data\session_state.json
PROJECT_ROOT\data\accounts.json
PROJECT_ROOT\data\selectors_registry.json
PROJECT_ROOT\logs\automation.log
PROJECT_ROOT\scripts\session_runtime.ps1
C:\Users\11\browser-automation-core\launch_browser.bat
```

---

## DESCRIPTION GENERATION

Generate exactly 8 prompts per trend:

| Slot | Aspect | Purpose |
| --- | --- | --- |
| 16A | 16:9 | Establishing shot |
| 16B | 16:9 | Close-up detail |
| 16C | 16:9 | Overhead or aerial |
| 16D | 16:9 | Mood or demographic variant |
| 1A | 1:1 | Centered portrait |
| 1B | 1:1 | Extreme close-up |
| 1C | 1:1 | Flat-lay or top-down lifestyle |
| 1D | 1:1 | Cultural or demographic variant |

Prompt rules:

- every slot must be unique
- keep subject, composition, mood, and buyer use case explicit
- no repeated prompt phrasing across the same 8-image set
- optimize for stock usefulness, not artistic novelty alone
- every trend must be strong enough to support the full 8-slot series
- descriptions must be built dynamically from the actual ranked trend list, never from a fixed hardcoded count

Session cap rule:

- one session may create at most 64 images total
- that means 32 wide (`16:9`) and 32 square (`1:1`)
- because each trend needs 8 images, one session may queue at most 8 trends
- if there are more ranked trends than the current session can handle, mark the extra trends as `deferred_next_session`
- the next session must start from those deferred trends first, then continue with newer trends
- this is a per-session cap, not a per-calendar-day cap
- if you intentionally start a new session later on the same day, it gets a fresh 64-image budget

If runtime JSON files are missing on a fresh first-time project, run:

```text
powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action bootstrap
```

If the project already has historical downloads/logs and runtime JSON is missing or damaged, do not bootstrap. Run:

```text
powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action reconcile
```

Build the dynamic description inventory from `trend_data.json` with:

```text
powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action build-descriptions
```

Run this only at session start. Do not rebuild `descriptions.json` after image generation has already begun for the active session.

Before risky model/provider experiments, create a local-state backup first:

```text
powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action backup
```

If this is a stage-only run, set mode with:

```text
powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action stage -Stage image_creation
```

The runtime creates `descriptions.json`. This stage must fill these keys:

- `generated_at`
- `total_descriptions`
- `session_active_descriptions`
- `deferred_descriptions`
- `session_image_cap`
- `session_aspect_cap`
- `session_trend_cap`
- `loop_index`
- `descriptions_per_trend`
- `series_structure`
- `carry_forward_trends[]`
- `descriptions[]`

Each `descriptions[]` item must include:

- `id`
- `trend_id`
- `trend_topic`
- `series_slot`
- `aspect_ratio`
- `quantity`
- `prompt_text`
- `commercial_tags`
- `status`
- `prompt_batch`
- `prompt_batch_type`
- `deferred_until_next_session`

---

## FLOW BROWSER RULES

Always use the shared browser automation framework:

```text
C:\Users\11\browser-automation-core\
```

Launch through:

```text
C:\Users\11\browser-automation-core\launch_browser.bat
```

Rules:

- never launch a raw Chrome process directly
- start the debug browser by running `launch_browser.bat` with no extra arguments
- connect to the existing debug browser if port 9222 is already ready
- if the Flow page is not already open, the runtime should open Flow or the saved project URL after connecting
- find tabs by URL pattern, never by title
- discover selectors once, then cache them in `selectors_registry.json`
- for dynamic menus, trigger first, wait for DOM change, then resolve selectors

---

## FLOW SESSION SETUP

1. Open `https://labs.google/fx/tools/flow`
2. Resolve the current account's active project URL dynamically
3. Save the resolved URL to `session_state.json`
4. Dismiss the one-time "New Image Aspect Ratios" modal if it appears
5. Verify these defaults before the loop:
   - output type = image
   - quantity = x1
   - aspect ratio = set per slot
   - model = current session model

Current model priority:

1. Nano Banana 2
2. Nano Banana Pro

---

## SUB-AGENT SYSTEM

Do not skip the sub-agent system.

- Sub-Agent A - Prompt builder
  Converts ranked trends into the full 8-slot prompt set and updates `descriptions.json`.
- Sub-Agent B - Flow operator
  Submits prompts, switches models/accounts when needed, and keeps `session_state.json` current.
- Sub-Agent C - Background file watcher
  Monitors downloads, renames/moves files, and confirms group completion signals.
- Sub-Agent D - Metadata sidecar writer
  Writes `[image_path].metadata.json` as soon as each download is confirmed.

If true parallel sub-agents are unavailable, preserve the same four roles sequentially. Do not collapse them into one vague stage.

## MANDATORY PLANNER / GENERATOR / EVALUATOR LOOP

This file must always run under a Planner -> Generator -> Evaluator loop.

- **Planner**
  reads this file fully and extracts the prompt-series rules, Flow browser rules, rolling download behavior, FIFO handoff behavior, account switching rules, and sidecar contract
- **Generator**
  executes the actual Flow creation, rolling download, rename/move, sidecar creation, and FIFO background prepare actions
- **Evaluator**
  checks that:
  - the sub-agent system was actually used
  - prompts follow the slot structure and are commercially distinct
  - the downloader ignored old project renders
  - download order and nonblocking behavior were respected
  - every downloaded image has the correct `.metadata.json` sidecar
  - session state and logs reflect the current batch accurately

If the Evaluator finds skipped sub-agents, weak prompts, duplicate downloads, missing sidecars, stale-batch drift, or blocking behavior that should have been nonblocking, the Generator must correct the stage before it passes.

If parallel agents are unavailable, preserve the same Planner -> Generator -> Evaluator sequence inside one controlling run.

---

## CREATION LOOP

For each ranked trend:

### Phase 1 - 16:9 group

1. Submit 16A, 16B, 16C, 16D one by one
2. Keep quantity at `x1`
3. Wait 1 second between submissions
4. Do not wait for each render before sending the next slot
5. Do not wait for the first 4-image batch to fully render before starting the next 4-image batch
6. In full-system runs, do not block on `--wait-for-outcomes` before moving the pipeline forward unless you are doing a targeted verification or retry pass
7. Once the current 4-prompt group is queued, the rolling downloader may start harvesting completed renders while the next group is already being prepared or submitted
8. never queue prompts whose description status is `deferred_next_session`
9. once the session reaches 32 wide prompts, stop wide generation for that session

### Phase 2 - Wait and download 16:9

1. Start the rolling downloader immediately after submission begins
2. Do not wait for all 4 images to finish rendering
3. Download each image the moment it becomes render-ready
4. Prefer `2K` download
5. If the same image fails `2K` twice, use `1X` and mark that fallback in sidecar/state
6. Keep only a 1-second gap between download requests
7. Ignore every image that existed in the Flow project before this session's current batch
8. Treat the current run as an active session window: anything visible before the first batch of this run is old and must be ignored; anything rendered after that baseline belongs to this run and is eligible for download
9. Download order must be bottom-to-top, then right-to-left so the newest renders are handled first
10. Do not block completed images just because sibling images in the same batch are still rendering or have failed

Background file watcher:

- monitor the system downloads folder continuously during the session
- treat only the current active session run as valid download scope; previous-session Flow renders in the same project must be ignored completely
- when a new file appears:
  - rename it to `[trend_topic]_[series_slot]_L[loop_index]_[seq]_[date].png`
  - move it to `PROJECT_ROOT\downloads\[session_date]\`
  - trigger Sub-Agent D to write the matching `.metadata.json`
  - update `session_state.downloaded_images`
  - increment `images_downloaded_count`
  - log `Downloaded + metadata written: [filename]`
  - if `session_state.post_download_policy = fifo_upscale_prepare`, immediately queue `powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action fifo -ImagePath "[saved_path]"` in the background and continue downloading the next ready image without waiting for upscale completion
  - FIFO background prepare is the default for this project, including stage-only image-creation runs, unless a slower recovery run explicitly changes the policy

Full-system rolling command surface:

```text
Submit batch:          npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=submit-batch --prompt-ids=... --aspect=16:9|1:1
Rolling downloader:    npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=download
Legacy alias:          npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=download-nonblocking
Recovery sweep only:   npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=download-recovery
Retry failed prompts:  npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=retry-failed
Recover UI failures:   npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=recover-failures
```

Rule:

- `download` is the default fully parallel downloader for this project
- it must click `Download -> 2K` and move on immediately without waiting for the current file to finish before requesting the next ready image
- use `download-recovery` only as a slower exact recovery sweep
- both download commands must filter against the active session run baseline stored in `session_state.json`; they must not sweep old project renders from earlier sessions
- submit the next prompt group without waiting for the previous group to fully render
- if a targeted verification pass is needed for one group, use `submit-batch ... --wait-for-outcomes`
- if the runtime records failed prompts for a group, use `retry-failed` immediately instead of leaving the batch incomplete
- if Flow shows visible failed tiles or exception states that were not already captured into runtime batch state, use `recover-failures` before trying to repair them manually
- prefer runtime recovery commands over ad hoc UI improvisation whenever the same exception can be scripted

Failure JSON trigger:

- do not hand-write failed-image JSON in this file
- failed download records are created automatically by the download runtime command:

```text
npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=download
```

- that command writes `downloads\failed\[YYYY-MM-DD]\[asset_name]\[asset_name].failure.json`
- the failure JSON uses:
  - `reason_code = image_download_failed`
  - `reason_detail =` the real download error or fallback failure detail
- any related partial file is moved there automatically

Render failure rules:

- a failed image does not block successful siblings from being downloaded
- download requests themselves must remain nonblocking; once `Download -> 2K` is clicked for one ready image, move directly to the next ready image
- if an image fails, first attempt the retry path instead of assuming a hard limit
- retry method order:
  - use the runtime retry flow for failed prompts
  - if needed, re-submit the same prompt through the batch submit worker
- every retry attempt must be logged to `automation.log`

Step 3 complete signal:

- all currently rendered 16:9 images are confirmed in `downloaded_images`
- or 60 seconds pass since the last upscale request with no more pending renders
- then log `16:9 group for [trend_topic] complete. [N] images downloaded.`
- then proceed to the 1:1 group

### Phase 3 - 1:1 group

Repeat the same pattern for 1A, 1B, 1C, 1D.

Session stop rule:

- once `images_created_count = 64`, stop generation for the current session
- once `images_created_16x9_count = 32`, do not submit more wide prompts in this session
- once `images_created_1x1_count = 32`, do not submit more square prompts in this session
- if the operator wants another 64-image run on the same day, start a new session and rebuild the description inventory
- a new session must prioritize `carry_forward_trends` before new trend topics

### Phase 4 - Move to next trend

After all available downloads finish for the current 8-slot set:

- write sidecars for every downloaded image
- mark prompt statuses in `descriptions.json`
- in `full_system` mode, each confirmed download should already be entering FIFO upscale/prepare
- continue to the next trend

This loop is rolling and non-blocking. Do not force perfect 4-image batch completeness before continuing work. Keep later batches moving while the downloader and retry flow resolve already-started batches in parallel.

---

## RATE LIMIT HANDLING

Check for limits in two places:

1. modal or toast error messages
2. thumbnail text inside partially rendered gallery cards

When a limit is detected:

### If current model is Nano Banana 2

- mark `nano_banana_2_exhausted = true` for the active account
- switch to Nano Banana Pro
- download any successful renders before retrying
- retry the same failed description once the model switch completes

### If current model is Nano Banana Pro

- mark `nano_banana_pro_exhausted = true`
- mark the account `fully_exhausted = true`
- download any successful renders before switching accounts

### If all accounts are exhausted

- save state
- finish remaining downloads
- stop the generation loop cleanly

---

## ACCOUNT SWITCHING

When an account is fully exhausted:

1. open the Google account menu
2. sign out
3. return to the Flow landing page if needed
4. click `Create with Flow`
5. select the next account from `accounts.json` where `fully_exhausted = false`
6. resolve that account's current project URL again
7. continue the same session from the same trend/slot

Never assume the previous account's project URL is valid for the next account.

---

## METADATA SIDECAR CREATION

Sub-Agent D fires immediately after each confirmed download.

For every downloaded image, write:

```text
[image_path].metadata.json
```

Minimum sidecar contract:

- `generated_at`
- `source_image`
- `prompt_text`
- `trend_id`
- `trend_topic`
- `trend_category`
- `series_slot`
- `aspect_ratio`
- `loop_index`
- `status`
- `adobe_stock_metadata.title`
- `adobe_stock_metadata.title_char_count`
- `adobe_stock_metadata.keywords`
- `adobe_stock_metadata.category`
- `adobe_stock_metadata.file_type`
- `adobe_stock_metadata.ai_generated`
- `adobe_stock_metadata.people_or_property_fictional`

Rules:

- never create AI metadata from the downloaded filename, Flow suggested filename, or renamed output stem
- create AI metadata from the known generation context: prompt, trend topic, trend category, commercial tags, and success-report rules
- preserve prompt detail in the sidecar, including composition and object cues such as:
  - top view / overhead / bird's-eye / flat-lay
  - close-up / macro / portrait / wide shot
  - hand holding / card / tablet / screen / receipt / eye / server racks
- if the prompt-to-image relationship is unclear, mark the sidecar for visual validation; do not invent filename-based metadata
- keep titles under 70 characters
- follow the 35-keyword blueprint from the success report
- target 25-35 strong keywords; anything under 20 is too weak and must be rebuilt before File 04 trusts it
- choose the best Adobe Stock category now, not later
- sidecar and image must always travel together
- this sidecar is the source of truth for File 03's XMP embed step; it is not just a later File 04 reference

Strict prohibition:

- the downloaded filename is only a transport identifier
- it must never be treated as the semantic source for title, keywords, or category
- if prompt context is missing, write a rebuild-required sidecar and stop the metadata draft path for that image until the context is restored

---

## SESSION STATE REQUIREMENTS

Maintain these operational fields in `session_state.json`:

- `session_date`, `session_started_at`
- `pipeline_mode`, `post_download_policy`
- `session_image_cap`, `session_aspect_cap`, `session_upscale_batch_size`, `session_trend_cap`
- `current_stage`, `last_completed_stage`, `current_step`
- `current_account_index`, `current_account_email`, `current_model`
- `current_aspect_ratio`
- `loop_index`, `current_description_index`
- `current_project_url`, `current_project_id`
- `current_trend_id`, `current_series_slot`
- `queued_trend_ids`, `deferred_trend_ids`
- `remaining_session_image_capacity`, `remaining_16x9_capacity`, `remaining_1x1_capacity`
- `descriptions_queue`
- `images_created_count`, `images_created_16x9_count`, `images_created_1x1_count`, `images_downloaded_count`, `downloads_completed`
- `upscale_requested_ids`, `downloaded_images`
- `current_16x9_submitted`, `current_16x9_rendered`, `current_16x9_failed`, `current_16x9_downloaded`
- `current_1x1_submitted`, `current_1x1_rendered`, `current_1x1_failed`, `current_1x1_downloaded`
- `limit_reached_on_image`
- `accounts`

---

## OUTPUTS AND HANDOFF

Primary outputs:

- `PROJECT_ROOT\data\descriptions.json`
- downloaded images in `PROJECT_ROOT\downloads\[YYYY-MM-DD]\`
- matching `.metadata.json` sidecars
- updated `session_state.json`
- updated `selectors_registry.json`

Handoff:

```text
Next execution file: 03_IMAGE_UPSCALER.md
```

Pass forward:

- downloaded images
- sidecars
- registry-relevant filenames
- any 2K-to-1X fallback markers

---

## SUCCESS CRITERIA

This file is complete when:

- every selected trend has an 8-slot prompt series
- all successful renders were downloaded
- every downloaded image has exactly one `.metadata.json` sidecar
- model/account exhaustion state is accurate
- the output is ready for `03_IMAGE_UPSCALER.md`
