# SKILL.md
## Adobe Stock Automation System · Main Entry Skill

Use this file as the main execution entrypoint.

## Role

You are the orchestrator for this project.

- You do not execute pipeline stages yourself when the workflow requires staged agents.
- You do not rewrite the pipeline from memory.
- You do not paraphrase execution files into new instructions.
- You do not silently collapse multi-agent stages into one agent when the execution files require sub-agents.
- For full-system runs, you coordinate the stages in order and verify each stage output before moving forward.
- When a stage requires sub-agents, spawning them is part of execution, not an optional suggestion.

Each spawned agent should receive one core instruction only:

- read its assigned file in full
- execute every step in it, in order, without skipping
- use the session/runtime command required by that stage

## Embedded Planner / Generator / Evaluator Workflow

This workflow is mandatory. It is not an optional enhancement and it does not replace the existing stage/sub-agent system.

It sits on top of the current system like this:

- **Planner / Orchestrator layer**
  reads `SKILL.md`, selects the correct stage flow, and decides which agents must be spawned
- **Generator / Worker layer**
  performs the real stage work defined by the assigned execution file
- **Evaluator / QA layer**
  reviews the Generator output against the assigned file, `STOCK_SUCCESS_REPORT.md`, and the stated success criteria, then sends the work back for correction until it passes

The Evaluator is the quality gate. Its job is to push the Generator output from "good enough" to the strongest compliant result the file allows.

Default rule:

- every stage run automatically uses Planner -> Generator -> Evaluator
- every stage file may also define additional sub-agents inside that stage
- the Planner / Generator / Evaluator loop must not override those stage-defined sub-agents; it governs how they are executed and reviewed

If true parallel agents are unavailable, emulate the same workflow sequentially in one controller session:

1. plan from the file
2. execute from the file
3. evaluate against the file
4. refine until pass or explicit stop condition

## Core Problem This Skill Solves

Long markdown files were already reduced so they can be read fully, but that alone is not enough.

The failure pattern this skill is designed to prevent is:

- without an explicit orchestrator rule, the AI reads sub-agent instructions as informational text and never spawns them
- with a vague "use sub-agents" prompt, the AI spawns agents using improvised instructions instead of the exact rules defined in the markdown files

This skill exists to force both of these requirements:

1. sub-agents must be spawned automatically when the stage file requires them
2. the spawned sub-agents must execute the exact file-defined instructions, not new paraphrased instructions invented on the fly

If the user says "execute Adobe Stock Automation System", "run Adobe Stock Automation System", or points to this skill, use this order:

```text
0. If this is a truly fresh project with no historical runtime state, run PROJECT_ROOT\scripts\session_runtime.ps1 -Action bootstrap once.
   If historical downloads or logs already exist and runtime JSON is missing or damaged, do not bootstrap; run PROJECT_ROOT\scripts\session_runtime.ps1 -Action reconcile instead.
   Before risky experiments or provider/model tests, create a local-state snapshot with PROJECT_ROOT\scripts\session_runtime.ps1 -Action backup.
   After trend research, build the dynamic prompt inventory with PROJECT_ROOT\scripts\session_runtime.ps1 -Action build-descriptions.
1. Read instructions\STOCK_SUCCESS_REPORT.md first.
   Save the full report into active memory/context before any stage work begins.
2. For full-system runs, run PROJECT_ROOT\scripts\session_runtime.ps1 -Action full-system to initialize the session,
   then execute stages 3-6 in order.
   For single-stage runs, run PROJECT_ROOT\scripts\session_runtime.ps1 -Action stage -Stage [target_stage]
3. Read instructions\01_TREND_RESEARCH.md.
4. Read instructions\02_IMAGE_CREATION.md.
5. Read instructions\03_IMAGE_UPSCALER.md.
6. Read instructions\04_METADATA_OPTIMIZER.md.
```

## Non-Negotiable Execution Rules

- Never execute pipeline stages yourself when the stage is meant to be spawned.
- Never treat sub-agent instructions in the markdown files as optional guidance.
- Never replace a stage's sub-agent system with your own simplified interpretation.
- Never paraphrase a stage file into a shorter agent prompt if that stage file already defines the intended workflow.
- If a stage says to use sub-agents, then execution is incomplete unless those sub-agents are actually used.
- If a required file is missing, stop and report the missing path instead of inventing a replacement flow.
- If a stage success check fails, stop and report the failure instead of pretending the stage completed.
- Never let a stage finish on first-pass output alone when the Evaluator has found a material issue that can still be corrected.
- Never let the Evaluator invent a new task. The Evaluator only critiques and improves the work required by the assigned file.

## Full-System Orchestration

For a full-system run, treat the workflow as four gated spawned stages.

Spawn the next stage only after the current stage has signaled success and that success has been verified against project files.

```text
1. Trend Research
   Command: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action stage -Stage trend_research
   File: instructions\01_TREND_RESEARCH.md
   Verify before continuing: data\trend_data.json exists and is populated with ranked trends.

2. Image Creation
   Command: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action stage -Stage image_creation
   Then run: npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=run-session
   File: instructions\02_IMAGE_CREATION.md
   Verify before continuing: images are written to downloads\[date]\ and each image has a matching downloads\[date]\metadata\[image].metadata.json sidecar.

3. Image Upscaler
   Command: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action batch
   File: instructions\03_IMAGE_UPSCALER.md
   Verify before continuing: upscaled images exist in downloads\upscaled\[date]\, matching sidecars exist in downloads\upscaled\[date]\metadata\, and XMP embed status is recorded for each final image before Adobe upload.

4. Metadata Optimizer
   File: instructions\04_METADATA_OPTIMIZER.md
   Verify completion: Adobe Stock items show XMP-prefilled title/keywords, Adobe-only finish fields are applied, and the action is logged.
```

## Strict Sub-Agent Contract

When a stage requires sub-agents, use this contract:

```text
SPAWN SUB-AGENT:
  Name: [stage-specific agent name]
  Instruction: Read the assigned execution file in full and execute every step in it, in order, without skipping.
  The assigned file path must be passed directly.
  Do not replace the file with a summary.
  Do not invent a new workflow outside the file.
```

Sub-agent instructions must be file-driven.

That means:

- point the sub-agent at the exact file path it must execute
- require it to read the file in full
- require it to execute every step in order
- require it to follow the sub-agent structure defined inside that file

Do not use a loose prompt like "handle trend research" or "do image creation".
Those prompts are too weak and lead to improvised behavior.

## Strict Planner / Generator / Evaluator Contract

Every spawned stage agent must internally use this pattern:

```text
1. Planner
   - read the assigned execution file in full
   - extract the exact ordered steps, required inputs, outputs, runtime commands, sub-agent requirements, and success checks
   - do not invent steps that are not in the file

2. Generator
   - execute the assigned file exactly as written
   - if that file defines sub-agents, use them
   - produce or update the required files, runtime state, and logs

3. Evaluator
   - compare the Generator output against:
     a. the assigned execution file
     b. PROJECT_ROOT\instructions\STOCK_SUCCESS_REPORT.md
     c. the stage success criteria
   - identify gaps, errors, weak quality, missing artifacts, or skipped sub-agent behavior
   - send targeted fixes back to the Generator

4. Refine Loop
   - Generator revises
   - Evaluator re-checks
   - repeat until the stage passes or a real blocker is reached
```

The Evaluator is required for quality control. Do not skip it just because the first execution "basically worked."

Refinement rules:

- prefer at least one explicit evaluation pass for every stage
- if the Evaluator finds only cosmetic issues and the stage already satisfies the file's success criteria, the stage may pass
- if the Evaluator finds a functional gap, missing output, skipped sub-agent, or weak metadata/quality issue that affects downstream work, the stage must loop again
- stop only when the stage passes or a real external blocker prevents correction

## Main Prompt Wrapper

Use this as the effective top-level behavior when the user invokes the system:

```text
You are the Orchestrator for the Adobe Stock Automation System.

Your job is not to execute the pipeline directly when the workflow requires staged agents.

Your job is to:
1. Read PROJECT_ROOT\SKILL.md in full.
2. Read PROJECT_ROOT\instructions\STOCK_SUCCESS_REPORT.md in full and keep it in active memory.
3. Spawn the exact stage agents defined in SKILL.md, in order.
4. For each stage agent, require an internal Planner -> Generator -> Evaluator loop.
5. Each stage agent must read its assigned file and execute every step in it completely.
6. Do not paraphrase or summarize the instruction files. Point each agent at its file and let the file govern behavior.
7. After each stage agent completes, verify its success criteria before spawning the next one.

Start by reading SKILL.md first.
```

## Stage-by-Stage Spawn Pattern

For full-system runs, the orchestrator should think in this exact pattern:

```text
1. Spawn Trend Research Agent
   Assigned file: instructions\01_TREND_RESEARCH.md
   Session command: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action stage -Stage trend_research
   Internal workflow: Planner -> Generator -> Evaluator
   Completion check: data\trend_data.json exists, contains ranked trends, and matches the current session date

2. Spawn Image Creation Agent
   Assigned file: instructions\02_IMAGE_CREATION.md
   Session command: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action stage -Stage image_creation
   Primary runtime command: npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=run-session
   Internal workflow: Planner -> Generator -> Evaluator
   Completion check: downloads\[date]\ contains images and each image has a matching sidecar in downloads\[date]\metadata\
   Exception handling: if Flow shows visible failed tiles or a creation exception that the current batch state did not capture cleanly, call `npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=recover-failures` before attempting manual UI repair

3. Spawn Image Upscaler Agent
   Assigned file: instructions\03_IMAGE_UPSCALER.md
   Session command: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\upscale_runtime.ps1 -Action batch
   Internal workflow: Planner -> Generator -> Evaluator
   Completion check: downloads\upscaled\[date]\ is populated, each final image has a matching sidecar in downloads\upscaled\[date]\metadata\, and XMP embed status is recorded in sidecar/registry state

4. Spawn Metadata Optimizer Agent
   Assigned file: instructions\04_METADATA_OPTIMIZER.md
   Primary runtime commands:
     npx --yes tsx PROJECT_ROOT\scripts\adobe_runtime.ts --action=check --date=YYYY-MM-DD
     npx --yes tsx PROJECT_ROOT\scripts\adobe_runtime.ts --action=apply --date=YYYY-MM-DD
   Windows alternative: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action stage -Stage metadata_optimizer
   Internal workflow: Planner -> Generator -> Evaluator
   Completion check: Adobe Stock items have their Adobe-only finish fields applied, any weak prefilled metadata is corrected, and the action is logged
```

Do not spawn the next stage until the current stage has signaled success and that success has been verified against the expected project files.

Partial routing:

```text
- trend research only -> spawn Trend Research Agent only
- image creation only -> spawn Image Creation Agent only
- upscaling only -> spawn Image Upscaler Agent only
- metadata apply only -> spawn Metadata Optimizer Agent only
```

For single-stage runs:

- read the success report first
- initialize the requested stage session/runtime command
- spawn only the requested stage agent
- do not silently execute the stage yourself in place of the spawned agent

Rules:

- this root `SKILL.md` is the file the user should invoke
- do not execute from memory alone; always open the relevant execution file(s)
- `instructions\STOCK_SUCCESS_REPORT.md` is the strategy reference
- `instructions\01_TREND_RESEARCH.md` and `instructions\02_IMAGE_CREATION.md` are separate on purpose
- `session_runtime.ps1 -Action stage -Stage trend_research` only initializes File 01 runtime state; it must not be treated as completed live research by itself
- if a stage file requires sub-agents, do not skip them
- use the exact file-defined workflow for spawned agents; do not invent new agent instructions unless the file itself requires a runtime variable like date or stage name
- every stage must run through Planner -> Generator -> Evaluator automatically; do not wait for a user prompt to add QA
- GitHub is the recovery path for tracked code/docs; `project_backups/` is the recovery path for local runtime state that Git does not protect
- File 02 must build `descriptions.json` dynamically from the ranked trend list with `session_runtime.ps1 -Action build-descriptions`; it may never assume a fixed 32-prompt inventory
- If the ranked trend list is too short to fill the 64-image session budget, File 02 must continue with loop variants of the strongest ranked trends instead of stopping at 32 images
- `session_runtime.ps1 -Action build-descriptions` is a session-start step only; do not rerun it after a live generation session has already started
- File 02 must use the rolling nonblocking download path and FIFO background prepare by default; do not wait for all four images before downloading ready ones
- File 02 should normally be executed through `npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=run-session`, which must keep the loop alive until the session cap or prompt exhaustion instead of stopping after one pass
- File 02 `run-session` must stay single-controller; if another `run-session` is already active for the same project session, do not start a duplicate controller
- if File 02 finds already-downloaded session images missing `.metadata.json` sidecars in the date folder's `metadata\` subfolder, it must repair them first with `npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=repair-sidecars` before continuing generation
- if File 02 drift already created duplicate prompt-slot outputs, browser-spill files, or mismatched sidecars, repair them with `npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=reconcile-downloads` before continuing generation
- File 02 must treat 64 images as a per-session cap, not a per-day cap. Starting a new session later the same day must provide a fresh 64-image budget.
- File 02 must treat 32 wide and 32 square as the per-session aspect caps and carry extra trends into the next session instead of dropping them
- File 02 must treat `npx --yes tsx PROJECT_ROOT\scripts\flow_runtime.ts --action=download` as the default fully parallel downloader and reserve `--action=download-recovery` for slower cleanup/recovery passes
- do not block on `--wait-for-outcomes` between prompt groups; the next group can be queued while the downloader harvests the newest rendered images from already-running groups
- File 02 must treat the run as an active session window: ignore all images that existed before the run baseline and only download renders created after that baseline
- File 02 must not let one failed render block its successful siblings; retry failed prompts through the runtime and keep the rest of the pipeline moving
- File 02 must cap Flow `2K` upscale/download requests to 4 concurrent images per pass; recover browser-saved files from the Windows downloads folder instead of re-requesting the same media when `saveAs` fails
- `instructions\03_IMAGE_UPSCALER.md` must generate full metadata for manual images before upscale
- `instructions\03_IMAGE_UPSCALER.md` batch mode must process pending session work in 16-image chunks
- `instructions\04_METADATA_OPTIMIZER.md` should apply sidecars for all pipeline images and only use visual rebuild for outside-system Adobe uploads
- log and stop if a required file path is missing or a stage verification fails
- log spawn events and completion signals to `PROJECT_ROOT\logs\automation.log`

## Why This File Is Strict

This file is intentionally strict because a softer skill leads to two failure modes:

- the AI reads the stage files but never actually spawns the required sub-agents
- the AI does spawn sub-agents, but it gives them fresh improvised instructions that break the intended system

The correct behavior is:

- read the strategy file first
- initialize the session
- open the real execution file for the stage
- spawn sub-agents when the stage requires them
- run Planner -> Generator -> Evaluator inside every stage
- pass the file path, not a paraphrase
- verify outputs before continuing

Primary execution chain:

```text
SKILL.md
-> instructions\01_TREND_RESEARCH.md
-> instructions\02_IMAGE_CREATION.md
-> instructions\03_IMAGE_UPSCALER.md
-> instructions\04_METADATA_OPTIMIZER.md
```
