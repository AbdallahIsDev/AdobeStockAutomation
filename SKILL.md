# SKILL.md
## Adobe Stock Automation System · Main Entry Skill

Use this file as the main execution entrypoint.

If the user says "execute this system" or points to this skill, use this order:

```text
0. Run PROJECT_ROOT\scripts\session_runtime.ps1 -Action bootstrap once if runtime JSON files are missing.
1. Read instructions\STOCK_SUCCESS_REPORT.md first.
   Save the full report into active memory/context before any stage work begins.
2. For full-system runs, run PROJECT_ROOT\scripts\session_runtime.ps1 -Action full-system
   For single-stage runs, run PROJECT_ROOT\scripts\session_runtime.ps1 -Action stage -Stage [target_stage]
3. Read instructions\01_TREND_RESEARCH.md.
4. Read instructions\02_IMAGE_CREATION.md.
5. Read instructions\03_IMAGE_UPSCALER.md.
6. Read instructions\04_METADATA_OPTIMIZER.md.
```

Partial routing:

```text
- trend research only -> read success report, run `session_runtime.ps1 -Action stage -Stage trend_research`, then read instructions\01_TREND_RESEARCH.md
- image creation only -> read success report, run `session_runtime.ps1 -Action stage -Stage image_creation`, then read instructions\02_IMAGE_CREATION.md
- upscaling only -> read success report, run `session_runtime.ps1 -Action stage -Stage image_upscaler`, then read instructions\03_IMAGE_UPSCALER.md
- metadata apply only -> read success report, run `session_runtime.ps1 -Action stage -Stage metadata_optimizer`, then read instructions\04_METADATA_OPTIMIZER.md
```

Rules:

- this root `SKILL.md` is the file the user should invoke
- do not execute from memory alone; always open the relevant execution file(s)
- `instructions\STOCK_SUCCESS_REPORT.md` is the strategy reference
- `instructions\01_TREND_RESEARCH.md` and `instructions\02_IMAGE_CREATION.md` are separate on purpose
- `instructions\03_IMAGE_UPSCALER.md` must generate full metadata for manual images before upscale
- `instructions\04_METADATA_OPTIMIZER.md` should apply sidecars for all pipeline images and only use visual rebuild for outside-system Adobe uploads
- if sub-agents are available, follow the sub-agent split defined inside `instructions\01_TREND_RESEARCH.md`

Primary execution chain:

```text
SKILL.md
-> instructions\01_TREND_RESEARCH.md
-> instructions\02_IMAGE_CREATION.md
-> instructions\03_IMAGE_UPSCALER.md
-> instructions\04_METADATA_OPTIMIZER.md
```
