# 01_TREND_RESEARCH.md
## Adobe Stock Automation System · Execution File 1

---

## PURPOSE

Research commercially strong stock-image topics, rank them, and write the session output to `PROJECT_ROOT\data\trend_data.json`.

This file does not generate images. It only:

1. boots the session state for the upstream pipeline
2. refreshes or reuses the static knowledge cache
3. runs dynamic trend research for the current session
4. scores and filters topics
5. hands the ranked trend list to `02_IMAGE_CREATION.md`

---

## SUCCESS REPORT PREREQUISITE

This file assumes `SKILL.md` already forced a full read of:

`PROJECT_ROOT\instructions\STOCK_SUCCESS_REPORT.md`

The report must be loaded into active memory before this file runs.

If this file is invoked directly without `SKILL.md`, read the full success report first, load it into memory, then continue.

---

## REQUIRED FILES

```text
PROJECT_ROOT\instructions\STOCK_SUCCESS_REPORT.md
PROJECT_ROOT\scripts\session_runtime.ps1
PROJECT_ROOT\data\session_state.json
PROJECT_ROOT\data\static_knowledge_cache.json
PROJECT_ROOT\data\dynamic_trend_cache.json
PROJECT_ROOT\data\trend_data.json
PROJECT_ROOT\data\descriptions.json
PROJECT_ROOT\data\accounts.json
PROJECT_ROOT\logs\automation.log
```

---

## ORCHESTRATOR BOOT

Command-first session start:

```text
Full system: powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action full-system
Stage only:  powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action stage -Stage trend_research
```

State safety rule:

```text
- bootstrap is for a fresh project only
- if runtime JSON is missing but historical downloads/logs already exist, run:
  powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action reconcile
- before risky testing, run:
  powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action backup
```

Then perform this reduced boot sequence:

```text
1. Confirm the full success report is already loaded into memory.
2. Load session_state.json, accounts.json, static_knowledge_cache.json, and dynamic_trend_cache.json.
3. Refresh static cache only if missing, expired (90+ days), or force_refresh=true.
4. Reuse dynamic cache if still inside the 4-hour window; otherwise refresh it.
5. Save ranked output to trend_data.json.
6. Build the dynamic description inventory from the ranked trends.
7. Handoff to 02_IMAGE_CREATION.md.
```

Keep `session_state.json` focused on the fields required to resume and audit the run:

- `session_date`, `session_started_at`
- `current_stage`, `last_completed_stage`, `current_step`
- `current_account_index`, `current_account_email`, `current_model`
- `current_project_url`, `current_project_id`
- `current_trend_id`, `current_series_slot`
- `static_cache_status`, `static_cache_age_days`
- `dynamic_cache_status`, `dynamic_cache_valid_until`
- `images_created_count`, `images_downloaded_count`
- `session_image_cap`, `session_aspect_cap`, `session_trend_cap`
- `queued_trend_ids`, `deferred_trend_ids`
- `errors`, `accounts`

Keep `accounts.json` minimal and non-sensitive in the repo:

- `accounts[]`
- `email`
- `display_name`
- `enabled`

Never hardcode real personal account emails into the instruction file.

---

## SUB-AGENT SYSTEM

Use sub-agents when the runtime supports them.

- Sub-Agent A - Static cache steward
  Checks `static_knowledge_cache.json`, refreshes evergreen knowledge only when missing, expired, or forced.
- Sub-Agent B - Dynamic search collector
  Runs the live search batches only when `dynamic_trend_cache.json` is stale or missing.
- Sub-Agent C - Trend scorer and ranker
  Scores candidates, rejects weak topics, and writes `trend_data.json`.

Coordinator rules:

- orchestrator confirms `STOCK_SUCCESS_REPORT.md` is already loaded in memory
- orchestrator runs the bootstrap script before delegating
- orchestrator merges sub-agent output into `session_state.json`, `dynamic_trend_cache.json`, and `trend_data.json`
- if sub-agents are unavailable, execute the same order sequentially in one run

## MANDATORY PLANNER / GENERATOR / EVALUATOR LOOP

This file must not run as a single blind worker pass.

Use this quality loop automatically:

- **Planner**
  reads this file fully, extracts the ordered research steps, cache rules, query batches, scoring logic, and output contract
- **Generator**
  executes the research flow and produces `dynamic_trend_cache.json` plus `trend_data.json`
- **Evaluator**
  checks that:
  - static vs dynamic cache rules were respected
  - stale cache was refreshed only when required
  - dynamic research covered the intended source mix
  - weak or non-visual trends were rejected
  - `trend_data.json` is populated, ranked, and commercially usable

If the Evaluator finds weak trend quality, skipped sub-agent behavior, or missing output fields, the Generator must revise before this stage is allowed to pass.

If true sub-agents are unavailable, preserve the same Planner -> Generator -> Evaluator sequence inside one controller session.

---

## RESEARCH MODEL

Use two layers only:

### 1. Static layer

Use cached evergreen knowledge for:

- high-value niches
- seasonal demand patterns
- stock-platform commercial preferences
- design/color trend guidance
- recurring commercial concepts

Rules:

- refresh only if cache is missing, expired, or `force_refresh=true`
- default cache lifetime: 90 days
- do not re-run static research every session
- static intelligence is stored in `PROJECT_ROOT\data\static_knowledge_cache.json`
- let the bootstrap script create the file skeleton; only real research should fill `static_data`
- use static cache as 25% of the final decision signal; the remaining 75% must come from fresh dynamic search

Required static cache keys:

- `cached_at`
- `valid_for_days`
- `force_refresh`
- `static_data.priority_niches`
- `static_data.seasonal_calendar`
- `static_data.design_signals`

Static rebuild batch, run only when cache is missing or expired:

```text
adobe stock best selling categories [current year]
adobe creative trends [current year] visual report
shutterstock creative trends [current year]
getty images visual trends [current year]
stock photography high demand niches [current year]
best selling stock image styles [current year]
adobe stock contributor tips top keywords [current year]
stock photo buyer search behavior [current year]
photography color trends [current year]
design visual trends [current year] commercial
stock photography composition trends [current year]
pinterest visual trends [current year]
behance dribbble design trends [current year]
canva design trends report [current year]
marketing visual content trends [current year]
```

This query block is execution data, not narrative guidance. Keep it here only as the command payload for the static-cache rebuild step.

### 2. Dynamic layer

Search fresh topics only when the dynamic cache is stale. Prioritize:

1. world news and geopolitics
2. economy and markets
3. money, finance, fintech, crypto
4. technology and AI
5. business and corporate events
6. science and health breakthroughs
7. social and cultural moments
8. environment and climate

Dynamic search results are stored in:

`PROJECT_ROOT\data\dynamic_trend_cache.json`

Dynamic cache rule:

- first run -> search live, write cache, set `valid_until = cached_at + 4 hours`
- rerun within 4 hours -> reuse cache, do not search again
- rerun after 4 hours -> search again, overwrite cache, set a new 4-hour window

Required dynamic cache keys:

- `cached_at`
- `valid_until`
- `ttl_hours`
- `queries_run`
- `sources_queried`
- `results`

---

## DYNAMIC SOURCES

Use a mix of these sources each run:

- Google News
- Reuters
- Bloomberg or CNBC
- Google Trends
- Hacker News
- Reddit trend/sentiment communities
- X trend (https://x.com/explore/tabs/news)
- one broad world/news source such as The Guardian

Do not overfit to one site. Cross-check topics across at least two sources before promoting them.

---

## DYNAMIC QUERY BATCHES

Run all query groups every session. Use the current date in time-sensitive searches.

### Batch A - World and geopolitics

```text
world news today
major world events happening now
geopolitical tensions latest news
international breaking news current date
```

### Batch B - Economy and markets

```text
global economy news today
stock market news today
central bank interest rate decision news
inflation recession economy latest
```

### Batch C - Finance and money

```text
fintech news today
banking news latest
crypto market news today
consumer money trends current year
```

### Batch D - Technology and AI

```text
AI news today
technology regulation latest
product launch news today
startup innovation current month
```

### Batch E - Business and corporate

```text
business headlines today
mergers acquisitions news latest
corporate layoffs hiring news
enterprise software trends today
```

### Batch F - Science and health

```text
science breakthrough news today
medical innovation latest
space exploration news current month
health technology news today
```

### Batch G - Social and culture

```text
social media trending topics today
cultural moments trending now
consumer behavior trend news
viral discussion current week
```

### Batch H - Environment and climate

```text
climate news today
renewable energy news latest
extreme weather current date
sustainability business news
```

---

## SCORING AND FILTERING

Use this weighted scoring model:

| Criterion | Weight | Description |
| --- | --- | --- |
| Live Search Signal Strength | 25% | Found in multiple sources today = stronger signal |
| Commercial Visual Versatility | 25% | Can this sell in ads, websites, presentations, editorial? |
| Visual Translateability | 15% | Can this concept become a compelling, concrete image? |
| Adobe Stock Cache Alignment | 15% | Matches Adobe's stated high-demand categories from cache |
| Competition on Adobe Stock | 10% | Fewer existing images = more opportunity |
| Trend Longevity | 10% | Will this topic remain relevant for weeks or months? |

Blend rule:

- dynamic live-search evidence supplies 75% of the practical signal
- static cache guidance supplies 25% of the practical signal
- use both together when ranking and when handing off image concepts

Scoring formula:

```text
trend_score = (live_signal x 0.25) + (commercial x 0.25) + (visual x 0.15) +
              (cache_alignment x 0.15) + ((10 - competition) x 0.10) + (longevity x 0.10)
```

Automatic boosters:

```text
+2.0 topic appears in both economic/finance and technology news
+1.5 topic aligns with current Adobe Creative Trends from cache
+1.0 topic appears in static cache low-competition niches
+0.5 topic is trending on 3+ source types (news + social + search)
```

Reject topics that are:

- impossible to express visually
- too abstract without a clear buyer use case
- stale and already oversaturated without a new angle
- celebrity-only gossip with weak stock demand
- too narrow to support an 8-image series

Prefer topics that can produce:

- business scenes
- finance and technology concepts
- social-issue illustrations
- healthcare/science visuals
- climate/sustainability compositions
- strong editorial or commercial concept art

---

## OUTPUT CONTRACT: `trend_data.json`

The bootstrap script creates the file skeleton. This stage must fill these keys:

- `generated_at`
- `session_date`
- `static_cache_used`
- `static_cache_age_days`
- `dynamic_cache_used`
- `dynamic_cache_cached_at`
- `dynamic_cache_valid_until`
- `dynamic_query_groups_run`
- `sources_queried`
- `trends[]`

Each `trends[]` item must include:

- `id`
- `topic`
- `category`
- `trend_type`
- `trend_score`
- `priority`
- `score_breakdown`
- `source_signals`
- `news_context`
- `commercial_tags`
- `visual_targets`
- `commercial_use_cases`
- `recommended_series`

Rules:

- rank strongest trends first
- keep only actionable topics
- write enough context for description generation
- do not write long narrative essays into the JSON

---

## HANDOFF TO `02_IMAGE_CREATION.md`

Before File 02 starts, build the prompt inventory dynamically from the current ranked trends:

```text
powershell -ExecutionPolicy Bypass -File PROJECT_ROOT\scripts\session_runtime.ps1 -Action build-descriptions
```

Rules:

- do not hardcode a fixed prompt count like 32
- generate 8 prompts per trend
- queue at most 8 trends for the current session (64 images total)
- move any extra ranked trends into `carry_forward_trends` for the next session
- do not rebuild the description inventory in the middle of a live generation session; rebuild only when starting a fresh session

When `trend_data.json` is ready:

```text
1. Mark session_state.current_stage = "image_creation".
2. Keep the ranked trends in memory.
3. Pass control to 02_IMAGE_CREATION.md.
4. Do not repeat trend research until the next session or explicit refresh.
```

---

## SUCCESS CRITERIA

This file is complete when:

- required report chapters were read successfully
- static cache is valid
- all dynamic batches ran
- low-value topics were filtered out
- `trend_data.json` exists and is ranked
- handoff to image creation is ready
