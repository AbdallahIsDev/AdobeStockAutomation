# FILE 01 — TREND RESEARCH & IMAGE CREATION AUTOMATION

### Adobe Stock Automation System · Part 1 of 3

---

## SYSTEM OVERVIEW

This file governs the **entire upstream pipeline**: from discovering what the world is searching for right now, converting those insights into high-converting image descriptions, creating the images on Google Flow AI (labs.google), and downloading every image at 2K resolution — all fully automated, without any human intervention beyond initial launch.

---

### ⚠ MANDATORY FIRST ACTION — READ THE SUCCESS REPORT

**Before executing ANY step in this file — before initializing state, before searching, before touching the browser — the agent MUST read the full contents of:**

```
C:\AdobeStockAutomation\data\STOCK_SUCCESS_REPORT.md
```

This file contains the complete strategic knowledge base that governs every decision made in this system: what makes a high-value image, how Adobe Stock's algorithm works, the correct keyword and title architecture, which niches are highest priority, quality standards, commercial thinking frameworks, and the full contributor success playbook.

**Every sub-agent in this system operates based on the intelligence in that report.** Without reading it first, the agent lacks the strategic context needed to make the right choices about trends, descriptions, image concepts, and quality filters.

**Reading rules:**

```
- Read the FULL file from start to finish — do not skim or skip chapters
- Load its contents into active context/memory before any other action
- If the file cannot be found at the path above → STOP and log:
  "CRITICAL: STOCK_SUCCESS_REPORT.md not found at expected path.
   Cannot proceed without the strategy knowledge base.
   Please ensure the file exists at: C:\AdobeStockAutomation\data\STOCK_SUCCESS_REPORT.md"
  → EXIT
- If the file is found and read successfully → log:
  "Strategy knowledge base loaded successfully. Proceeding with session."
  → Continue to SYSTEM STARTUP
```

---

**System Architecture — Sub-Agent Breakdown:**

```
┌──────────────────────────────────────────────────────────────────────┐
│              STEP 0 — MANDATORY PRE-BOOT (before all else)           │
│         READ: STOCK_SUCCESS_REPORT.md → Load into agent memory       │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ (only after successful read)
                               ▼
┌───────────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR AGENT  (coordinates all sub-agents, manages state)  │
└───────────────────────────┬───────────────────────────────────────┘
                            │
          ┌─────────────────┼──────────────────────┐
          ▼                 ▼                       ▼
  [SUB-AGENT A]      [SUB-AGENT B]          [SUB-AGENT C]
  Trend Research     Description            Image Creation
  & Intelligence     Generator              & Download
  Agent              Agent                  Agent
          │                 │                       │
          └─────────────────┼───────────────────────┘
                            ▼
                    [STATE MANAGER]
                    session_state.json
                    (tracks progress,
                     rate limits,
                     accounts,
                     image count)

  All agents above operate with STOCK_SUCCESS_REPORT.md
  loaded in memory as their strategic decision-making foundation.
```

**Output of this file feeds directly into:**

- `02_IMAGE_UPSCALER.md` — 4K upscaling & download management
- `03_METADATA_OPTIMIZER.md` — titles, keywords, categories & Adobe Stock upload pipeline

---

## PART 1 — ORCHESTRATOR AGENT

### Role

The Orchestrator is the master coordinator. It boots up all sub-agents in sequence, manages the shared state file, handles errors, retries, and decides when to pause or stop.

### Responsibilities

- **[STEP 0]** Read and internalize `STOCK_SUCCESS_REPORT.md` before all else
- Initialize `session_state.json` at startup
- Launch Sub-Agent A (Trend Research)
- Pass trend output to Sub-Agent B (Description Generator)
- Pass descriptions to Sub-Agent C (Image Creation & Download)
- Monitor rate limits and trigger account-switching logic
- Log all activity to `automation_log.txt`
- Stop gracefully when all rate limits across all accounts are exhausted

### Startup Sequence

```
STEP 0: READ STOCK_SUCCESS_REPORT.md  ← MUST happen before anything else
─────────────────────────────────────────────────────────────────
  Path: C:\AdobeStockAutomation\data\STOCK_SUCCESS_REPORT.md
  Action: Read the full file into agent memory
  On success: LOG "Strategy knowledge base loaded. Session starting."
  On failure: LOG "CRITICAL: Report not found. Halting." → EXIT

  Key knowledge loaded from the report that governs all decisions:
  • Which niches are highest priority (Chapter 1.3)
  • What makes an image commercially valuable (Chapter 2)
  • How Adobe's algorithm weights metadata (Chapter 3)
  • Title and keyword construction rules (Chapter 4)
  • AI image quality standards and disclosure rules (Chapters 4.3 & 6.3)
  • Aspect ratio buyer demand guide (Chapter 6.4)
  • Rejection avoidance checklist (Chapter 1.4)

STEP 1: Load session_state.json (or create fresh if first run)
STEP 2: Read accounts list from accounts.json
STEP 3: Check which accounts still have remaining quota today
STEP 4: If no accounts have quota → LOG "All quotas exhausted for today. Stopping." → EXIT
STEP 5: Launch Sub-Agent A → receive trend_data[]
STEP 6: Launch Sub-Agent B → receive descriptions[]
STEP 7: Launch Sub-Agent C → begin image creation loop
STEP 8: After each image batch → update session_state.json
STEP 9: On completion → write final summary to automation_log.txt
```

### State File: `session_state.json`

```json
{
  "session_date": "YYYY-MM-DD",
  "current_account_index": 0,
  "current_project_url": "[RESOLVED_AT_RUNTIME]",
  "current_project_id": "[RESOLVED_AT_RUNTIME]",
  "accounts": [
    {
      "email": "account1@gmail.com",
      "nano_banana_2_exhausted": false,
      "nano_banana_pro_exhausted": false,
      "fully_exhausted": false,
      "last_project_id": "[RESOLVED_AT_RUNTIME]"
    }
  ],
  "current_model": "Nano Banana 2",
  "current_aspect_ratio": "16:9",
  "loop_index": 0,
  "current_description_index": 0,
  "descriptions_queue": [],
  "images_created_count": 0,
  "images_downloaded_count": 0,
  "upscale_requested_ids": [],
  "downloaded_images": [],
  "errors": []
}
```

### Accounts File: `accounts.json`

```json
{
  "accounts": [
    { "email": "its.abdalla.dev@gmail.com",   "display_name": "Abdallah Saad" },
    { "email": "pubg112212ee@gmail.com",       "display_name": "Chinese" },
    { "email": "about.weblx@gmail.com",        "display_name": "Weblx agency" },
    { "email": "chinese112212ee@gmail.com",    "display_name": "abdalla saad" },
    { "email": "manmax112212ee@gmail.com",     "display_name": "Abdallah Saad" }
  ]
}
```

---

## PART 2 — SUB-AGENT A: TREND RESEARCH & INTELLIGENCE AGENT

### Role

Searches the live internet across multiple sources to discover what topics, events, and concepts are trending RIGHT NOW and have strong commercial stock image value. Prioritizes **world news, economy, money, finance, and technology** — fast-moving topics that generate fresh, unique results every session. Separates all research into two tiers: **DYNAMIC** (searched every run) and **STATIC** (searched once, cached permanently). Outputs a unified, scored list of actionable trend signals.

---

### CORE DESIGN PRINCIPLE: DYNAMIC vs. STATIC INTELLIGENCE

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RESEARCH INTELLIGENCE TIERS                      │
├───────────────────────────────┬─────────────────────────────────────┤
│  TIER 1 — DYNAMIC LAYER       │  TIER 2 — STATIC LAYER              │
│  (searched EVERY session)     │  (searched ONCE, cached forever)    │
│                               │                                     │
│  • World news today           │  • Adobe Creative Trends report     │
│  • Economy & markets today    │  • Top-selling stock categories      │
│  • Finance & money news       │  • Getty / Shutterstock trend lists  │
│  • Tech industry news         │  • Color & design trends of year     │
│  • Geopolitical events        │  • Commercial niche demand data      │
│  • Social media trending      │  • Stock platform keyword guides     │
│  • Business headlines         │                                     │
│  • Science & innovation news  │  Results change maybe once a year.  │
│                               │  No reason to re-search daily.      │
│  Results change daily/hourly. │                                     │
│  Must be fresh every session. │                                     │
└───────────────────────────────┴─────────────────────────────────────┘
```

**Rule:** Before running ANY search, Sub-Agent A checks the static cache first. Only the DYNAMIC layer searches the internet on every run.

---

### 2A — STATIC KNOWLEDGE CACHE SYSTEM

#### Cache File: `static_knowledge_cache.json`

This file is stored at:

```
C:\AdobeStockAutomation\data\static_knowledge_cache.json
```

It is **created on the very first run** and **never overwritten** unless:

- The agent detects the cache is older than **90 days** (quarterly refresh), OR
- The user manually sets `"force_refresh": true` in the config

#### Cache Validity Check (run at startup)

```
STEP 1: Check if static_knowledge_cache.json exists
  → If NOT exists: SET cache_is_valid = false → run STATIC SEARCH (Section 2A-2)

STEP 2: If exists, read "cached_at" timestamp
  → Calculate age in days: age = today - cached_at
  → If age >= 90 days: SET cache_is_valid = false → run STATIC SEARCH
  → If age < 90 days: SET cache_is_valid = true → SKIP static searches entirely

STEP 3: Load cache data into memory
  → Sub-Agent A merges static cache data with today's dynamic search results
  → This gives every session the benefit of deep evergreen knowledge + fresh news
```

#### Static Cache File Structure

```json
{
  "cached_at": "YYYY-MM-DDTHH:MM:SSZ",
  "valid_for_days": 90,
  "force_refresh": false,
  "static_data": {

    "adobe_creative_trends": {
      "source": "stock.adobe.com/trends",
      "year": "2026",
      "top_visual_trends": [
        "Neon Naturalism — vivid colors inspired by nature",
        "AI-Human Co-Creation — blending digital and organic",
        "Inclusive Authenticity — unposed, real people, real moments",
        "Sustainable Futures — green tech, circular economy visuals",
        "Tactile Textures — handmade, craft, analog revival",
        "Quiet Luxury — understated elegance, muted palettes",
        "Dynamic Stillness — action frozen in minimalist space"
      ],
      "top_color_palettes": [
        "Warm terracotta + sage green",
        "Electric blue + cream white",
        "Deep forest green + copper",
        "Soft coral + off-white",
        "Midnight navy + gold accent"
      ],
      "top_moods": [
        "Optimistic resilience",
        "Grounded ambition",
        "Calm confidence",
        "Playful seriousness"
      ]
    },

    "adobe_stock_top_categories": {
      "source": "Adobe Stock contributor research 2026",
      "high_demand_evergreen": [
        "Diverse people in professional settings",
        "Remote work and home office",
        "Mental health and wellness",
        "Sustainable technology and green energy",
        "Healthcare diversity and inclusion",
        "Family and lifestyle authenticity",
        "Food and healthy eating",
        "Education and e-learning",
        "Small business and entrepreneurship",
        "Urban lifestyle and city living"
      ],
      "high_demand_2026_specific": [
        "Artificial intelligence in everyday life",
        "Human-AI interaction and collaboration",
        "Electric vehicles and future transport",
        "Space technology and exploration",
        "Quantum computing concepts",
        "Biometric and digital identity",
        "Cryptocurrency and decentralized finance visuals",
        "Climate change impact and response",
        "Gen Z in the workplace",
        "Longevity and healthy aging"
      ],
      "low_competition_niches": [
        "Neurodiversity in workplace",
        "Aging population technology use",
        "Cultural fusion cuisine",
        "Micro-farming and urban agriculture",
        "Gender-neutral fashion and lifestyle"
      ]
    },

    "shutterstock_trends": {
      "source": "shutterstock.com/blog/creative-trends",
      "year": "2026",
      "trending_visuals": [
        "Raw, unfiltered documentary style",
        "Retro-futurism with modern subjects",
        "Hyper-minimalism with single hero element",
        "Warm film grain and analog aesthetics",
        "Bioluminescent and deep ocean inspired colors"
      ]
    },

    "getty_images_demand": {
      "source": "gettyimages.com trends data",
      "year": "2026",
      "editorial_demand": [
        "Climate summits and global diplomacy",
        "Space industry commercial growth",
        "AI regulation and governance",
        "Workforce transformation and automation"
      ],
      "commercial_demand": [
        "Inclusive team collaboration",
        "Data visualization concepts",
        "Biohacking and longevity science",
        "Fintech and digital payments"
      ]
    },

    "stock_keyword_strategy": {
      "source": "Adobe Stock contributor guidelines + top earner research",
      "title_rules": [
        "Under 70 characters",
        "Lead with primary subject noun",
        "Include setting/context",
        "Include emotion or commercial use signal",
        "No punctuation except commas"
      ],
      "keyword_rules": [
        "20–35 keywords per image",
        "First 7–10 must be buyer-intent long-tail phrases",
        "Use singular nouns where possible",
        "Mix: literal content + emotional concept + commercial application",
        "Include color, mood, setting, subject, action, industry"
      ],
      "rejection_avoidance": [
        "No visible brand logos or trademarks",
        "No copyrighted artwork visible",
        "No identifiable real people without model release",
        "No private property without property release",
        "No nudity or suggestive content",
        "Minimum 4MP resolution"
      ]
    },

    "design_trends_2026": {
      "source": "Behance / Dribbble / Pinterest Trends annual data",
      "dominant_styles": [
        "Neo-brutalism — bold, raw, high contrast layouts",
        "Organic UI — soft blobs, biomorphic shapes",
        "Dark mode lifestyle — premium, cinematic low-light scenes",
        "Serif renaissance — editorial luxury typography feel",
        "Glassomorphism — frosted glass, layered transparency"
      ],
      "composition_preferences": [
        "Rule of thirds with strong negative space",
        "Centered symmetry for premium/luxury feel",
        "Dutch angle for dynamic energy",
        "Worm's eye / bird's eye for impact",
        "Environmental portraits with strong depth of field"
      ]
    }
  }
}
```

#### When to Force-Refresh Static Cache

```
Force refresh triggers:
1. User sets "force_refresh": true in config.json
2. Cache file age > 90 days (auto-detected at startup)
3. Sub-Agent A detects a major platform announcement:
   e.g., "Adobe releases 2027 Creative Trends" found in dynamic news
   → Set force_refresh = true → Re-run static searches on next session
```

---

### 2B — DYNAMIC SEARCH LAYER (Run Every Session)

This is the live intelligence layer. Every session, Sub-Agent A runs all dynamic searches to capture what is happening in the world **right now**. The primary focus is:

```
★ PRIORITY FOCUS DOMAINS (in order):
  1. World News & Geopolitics
  2. Economy & Markets
  3. Money, Finance & Fintech
  4. Technology & Innovation
  5. Business & Corporate
  6. Science & Health Breakthroughs
  7. Social & Cultural Moments
  8. Environment & Climate
```

#### Dynamic Data Sources (Queried Every Session)


| Priority | Source                                                                                                     | Category              | What to Extract                                       |
| -------- | ---------------------------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| 1        | Google News — World (news.google.com/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB)      | World News            | Top 10 headlines, major events, geopolitical tensions |
| 2        | Google News — Business (news.google.com/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB)   | Economy / Finance     | Market movements, economic policy, corporate news     |
| 3        | Google News — Technology (news.google.com/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB) | Technology            | AI news, product launches, tech regulation            |
| 4        | Google News — Science (news.google.com)                                                                    | Science / Health      | Breakthroughs, medical advances, space news           |
| 5        | Reuters — World (reuters.com/world)                                                                        | World / Geopolitics   | Authoritative global events                           |
| 6        | Reuters — Business & Finance (reuters.com/business)                                                        | Economy / Money       | Markets, M&A, banking, trade                          |
| 7        | Bloomberg Topics (bloomberg.com/markets)                                                                   | Finance / Markets     | Stocks, crypto, commodities, currencies               |
| 8        | CNBC Latest (cnbc.com/latest-news)                                                                         | Business / Finance    | Real-time financial news, economic indicators         |
| 9        | Reddit — r/worldnews (reddit.com/r/worldnews/hot)                                                          | World / Culture       | Hot posts last 24h (cultural temperature check)       |
| 10       | Reddit — r/economics, r/investing, r/CryptoCurrency                                                        | Finance / Investing   | Community financial sentiment                         |
| 11       | Reddit — r/technology, r/artificial, r/singularity                                                         | Technology            | Viral tech discussions                                |
| 12       | Twitter/X Trending (x.com/explore/tabs/trending)                                                           | All categories        | Real-time trending globally                           |
| 13       | Google Trends — Daily Trending Searches (trends.google.com/trends/trendingsearches/daily)                  | All categories        | Top 20 trending search terms today                    |
| 14       | Hacker News (news.ycombinator.com)                                                                         | Technology / Startups | Top tech/business stories today                       |
| 15       | The Guardian — World (theguardian.com/world)                                                               | World / Society       | Diverse global coverage                               |


---

#### Dynamic Search Batches — Exact Queries to Execute

Run ALL batches every session. Use today's actual date in queries where noted.

---

**DYNAMIC BATCH 1 — WORLD NEWS & GEOPOLITICS** *(highest priority)*

```
"world news today [current date]"
"major world events happening now"
"global crisis news today"
"international breaking news [current month year]"
"geopolitical tensions latest news"
"world leaders summit news today"
"war conflict news latest"
"United Nations news today"
"refugee migration news latest"
"global humanitarian crisis [current year]"
```

*Visual translation targets: diplomacy scenes, protest/rally concepts, refugee journeys, international cooperation, conflict aftermath, border & identity, humanitarian aid*

---

**DYNAMIC BATCH 2 — ECONOMY & MARKETS** *(highest priority)*

```
"global economy news today"
"stock market news today [current date]"
"economic recession inflation news [current year]"
"central bank interest rate decision news"
"US economy latest news today"
"European economy news today"
"emerging markets economic news"
"global trade news today"
"supply chain disruption news latest"
"economic inequality wealth gap news [current year]"
```

*Visual translation targets: market charts/graphs, trading floors, economic graphs upward/downward, global trade shipping, supply chains, wealth disparity scenes, corporate boardrooms*

---

**DYNAMIC BATCH 3 — MONEY, FINANCE & FINTECH** *(highest priority)*

```
"financial news today latest"
"cryptocurrency bitcoin news today"
"fintech innovation news [current year]"
"digital payments banking news today"
"personal finance investing trends [current year]"
"hedge fund billionaire news today"
"IPO stock listing news today"
"central bank digital currency CBDC news"
"DeFi decentralized finance news latest"
"gold silver commodity price news today"
"real estate housing market news today"
"venture capital startup funding news today"
```

*Visual translation targets: cryptocurrency concepts, digital banking, investment planning, wealth management, fintech apps on phone, gold/commodities, real estate transactions, startup culture*

---

**DYNAMIC BATCH 4 — TECHNOLOGY & INNOVATION** *(highest priority)*

```
"artificial intelligence news today"
"AI breakthrough latest news [current date]"
"tech company news today"
"robotics automation news latest"
"electric vehicle EV news today"
"space technology news today"
"cybersecurity news latest"
"quantum computing news [current year]"
"semiconductor chip shortage supply news"
"big tech regulation antitrust news today"
"5G 6G network technology news"
"biotechnology gene editing news latest"
"autonomous vehicle self-driving car news"
"AR VR spatial computing news today"
"green tech clean energy technology news"
```

*Visual translation targets: AI robot human interaction, data centers, EV charging, space launches, cybersecurity shields, quantum computing concepts, chip manufacturing, biotech labs*

---

**DYNAMIC BATCH 5 — BUSINESS & CORPORATE** *(high priority)*

```
"major corporate news today"
"merger acquisition deal news today"
"layoffs hiring business news today"
"CEO leadership change news"
"corporate earnings results news today"
"small business entrepreneurship trends [current year]"
"remote work hybrid office news [current year]"
"ESG sustainability business news today"
"supply chain business disruption news"
"gig economy freelance work trend news"
```

*Visual translation targets: corporate offices, executive meetings, layoff stress, remote work setups, ESG sustainability branding, startup founding moments, business charts*

---

**DYNAMIC BATCH 6 — SCIENCE, HEALTH & MEDICINE** *(medium priority)*

```
"science breakthrough news today"
"medical research discovery news [current date]"
"health news today global"
"mental health awareness news [current year]"
"cancer treatment research news latest"
"longevity anti-aging science news"
"space exploration NASA discovery news"
"climate change research latest findings"
"pandemic disease outbreak news today"
"nutrition diet health trend [current year]"
```

*Visual translation targets: medical labs, doctor patient interaction, brain/mental health concepts, space imagery, climate science, research microscopes, healthy lifestyle*

---

**DYNAMIC BATCH 7 — SOCIAL, CULTURAL & LIFESTYLE** *(medium priority)*

```
"viral social media trend today"
"trending topics worldwide today [current date]"
"pop culture news today"
"social movement activism news today"
"diversity inclusion workplace news [current year]"
"gen z millennial lifestyle trend [current year]"
"travel tourism trend news [current year]"
"food beverage trend news today"
"fashion trend news [current season year]"
"sports major event news today"
```

*Visual translation targets: social activism, diverse lifestyle scenes, travel destinations, food photography, fashion lifestyle, sports celebration*

---

**DYNAMIC BATCH 8 — ENVIRONMENT & CLIMATE** *(medium priority)*

```
"climate change news today"
"extreme weather event news today"
"renewable energy solar wind news latest"
"environmental disaster news today"
"ocean pollution plastic news latest"
"deforestation biodiversity news [current year]"
"carbon neutral net zero company news"
"electric car adoption news [current year]"
"sustainable agriculture food news"
"green building smart city news"
```

*Visual translation targets: renewable energy installations, extreme weather aftermath, environmental activism, sustainable living, electric transport, green architecture*

---

**DYNAMIC BATCH 9 — SEASONAL EVENTS & HOLIDAYS** *(medium priority — auto-detected from current date)*

```
"upcoming holidays events [current month] [current year]"
"Christmas holiday season [current year] trends"
"New Year celebration [current year] trends"
"Halloween [current year] trends popular"
"Valentine's Day [current year] trends"
"Thanksgiving [current year] trends"
"Easter spring [current year] trends"
"Ramadan Eid [current year] trends"
"summer events festivals [current year]"
"back to school season [current year] trends"
"Black Friday shopping trends [current year]"
"Mother's Day Father's Day trends [current year]"
```

*Agent logic — date-driven activation:*
```
At session start, check today's date.
Calculate which holidays/seasonal events fall within the next 90–120 days.
Run ONLY the queries relevant to upcoming events in that window.
Examples:
  → If today is October: prioritize Halloween, Thanksgiving, Christmas, New Year queries
  → If today is January: prioritize Valentine's Day, Easter, Spring queries
  → If today is June: prioritize Summer, Independence Day, Back to School queries
  → Always include at least 3–5 queries regardless of season

Skip queries for seasons/events that are more than 120 days away.
These are low-priority because stock images need to be uploaded 90–120 days
in advance (per STOCK_SUCCESS_REPORT.md Chapter 5.1 seasonal calendar).
Events within the next 30 days are too late — skip those too unless already
uploading a backlog for next year's cycle.
```

*Visual translation targets: holiday decorations and scenes, family gatherings, seasonal food and gifting, festive lighting, cultural and religious celebrations, seasonal shopping, seasonal outdoor activities, seasonal fashion and lifestyle*

---

#### Dynamic Search Execution Protocol

```
EXECUTION ORDER:
1. Run Batch 1 (World News) — 10 queries
2. Run Batch 2 (Economy) — 10 queries
3. Run Batch 3 (Finance) — 12 queries
4. Run Batch 4 (Technology) — 15 queries
5. Run Batch 5 (Business) — 10 queries
6. Run Batch 6 (Science/Health) — 10 queries
7. Run Batch 7 (Social/Culture) — 10 queries
8. Run Batch 8 (Environment) — 10 queries
9. Run Batch 9 (Seasonal/Events) — 3–12 queries (date-driven, only relevant events)

PARALLELIZATION:
- Run queries within each batch in parallel (up to 5 at once)
- Run batches sequentially (to respect rate limits)
- Total queries per session: ~87–99 queries (varies based on seasonal batch size)
- Estimated time: 3–6 minutes

DEDUPLICATION:
- After all batches complete, deduplicate overlapping topics
- If same underlying story found in 3+ batches → merge into one high-confidence signal
- Cross-referencing across batches INCREASES the trend score for that topic
```

---

### 2C — TREND SYNTHESIS ENGINE

After all dynamic searches complete and static cache is loaded, the synthesis engine merges both layers into a final scored trend list.

#### Data Merging Logic

```
STEP 1: Load static cache data (evergreen commercial intelligence)
STEP 2: Load all dynamic search results (today's news and events)
STEP 3: For each dynamic news topic found:
  a. Extract the core concept (strip specific names, dates, locations when possible)
  b. Assess commercial visual translatability (can this be a compelling stock image?)
  c. Cross-reference against static cache:
     - Does this align with any adobe_creative_trends? → +1.5 score bonus
     - Does this align with adobe_stock_top_categories? → +1.0 score bonus
     - Is this in the low_competition_niches list? → +2.0 score bonus
  d. Score the merged trend signal
STEP 4: Sort all signals by final score
STEP 5: Take top 10–15 for image creation
```

#### Trend Scoring Model (Updated)


| Criterion                     | Weight | Description                                                    |
| ----------------------------- | ------ | -------------------------------------------------------------- |
| Live Search Signal Strength   | 25%    | Found in multiple sources today = stronger signal              |
| Commercial Visual Versatility | 25%    | Can this sell in ads, websites, presentations, editorial?      |
| Visual Translateability       | 15%    | Can this concept become a compelling, concrete image?          |
| Adobe Stock Cache Alignment   | 15%    | Matches Adobe's own stated high-demand categories (from cache) |
| Competition on Adobe Stock    | 10%    | Fewer existing images = more opportunity                       |
| Trend Longevity               | 10%    | Will this topic remain relevant for weeks/months?              |


**Scoring Formula:**

```
trend_score = (live_signal × 0.25) + (commercial × 0.25) + (visual × 0.15) +
              (cache_alignment × 0.15) + ((10 - competition) × 0.10) + (longevity × 0.10)
```

**Automatic Disqualifiers (score = 0, topic removed):**

```
✗ Topic involves a specific named real person (no model release possible)
✗ Topic is a single-day news flash with zero evergreen shelf life
  (e.g., "Politician X gave a speech today" — no lasting commercial value)
✗ Topic is inherently violent, graphic, or disturbing
✗ Topic requires copyrighted IP to illustrate
✗ Topic already has >500,000 results on Adobe Stock (oversaturated)
✗ Topic is highly politically polarizing with no commercial reframing possible
```

**Automatic Boosters:**

```
+2.0 — Topic appears in BOTH economic/finance AND technology news
       (intersection = very high commercial value, e.g., "AI in banking")
+1.5 — Topic aligns with current Adobe Creative Trends (from cache)
+1.0 — Topic is in static cache "low_competition_niches" list
+0.5 — Topic trending on 3+ different source types (news + social + search)
```

---

### 2D — OUTPUT FORMAT

#### `trend_data.json` (Full Output)

```json
{
  "generated_at": "YYYY-MM-DDTHH:MM:SSZ",
  "session_date": "YYYY-MM-DD",
  "static_cache_used": true,
  "static_cache_age_days": 12,
  "dynamic_queries_run": 87,
  "sources_queried": [
    "Google News", "Reuters", "Bloomberg", "CNBC", "Reddit",
    "Twitter/X Trending", "Google Trends Daily", "Hacker News", "The Guardian"
  ],
  "trends": [
    {
      "id": 1,
      "topic": "AI-Driven Financial Decision Making",
      "category": "Technology × Finance",
      "trend_type": "dynamic",
      "trend_score": 9.2,
      "score_breakdown": {
        "live_signal": 9,
        "commercial": 10,
        "visual": 8,
        "cache_alignment": 9,
        "competition": 7,
        "longevity": 9
      },
      "boosters_applied": ["+2.0 tech×finance intersection", "+1.5 Adobe cache alignment"],
      "source_signals": ["CNBC", "Bloomberg", "r/investing", "r/artificial", "Google Trends"],
      "news_context": "Reports of major banks deploying AI trading systems, leading to debate about algorithmic risk",
      "commercial_use_cases": [
        "Fintech app advertising",
        "Banking website hero images",
        "Investment platform marketing",
        "Business news editorial"
      ],
      "visual_keywords": [
        "AI financial analysis",
        "algorithmic trading concept",
        "digital banking future",
        "data-driven investment"
      ],
      "recommended_compositions": {
        "16:9": "Wide shot — trading floor or modern bank office with AI data overlays and diverse professionals",
        "1:1": "Close-up — focused professional analyzing glowing financial data on transparent screen"
      },
      "avoid": ["specific stock tickers", "real company logos", "panic/fear imagery"],
      "cache_references": ["adobe_stock_top_categories.high_demand_2026_specific[fintech]", "adobe_creative_trends[AI-Human Co-Creation]"]
    }
  ],
  "total_trends_found": 28,
  "trends_after_filtering": 15,
  "recommended_for_image_creation": 10,
  "top_topics_summary": [
    "AI-Driven Financial Decision Making",
    "Global Interest Rate Policy Shifts",
    "Cryptocurrency Mainstream Adoption",
    "Autonomous Vehicle Economy",
    "Climate Tech Investment Boom",
    "Remote Work Culture Evolution",
    "Supply Chain Robotics",
    "Digital Health & Telemedicine",
    "Space Economy Commercialization",
    "Green Energy Infrastructure"
  ]
}
```

---

### 2E — CACHE MAINTENANCE RULES

```
RULE 1 — NEVER delete static_knowledge_cache.json automatically
RULE 2 — Age check runs at every startup (compare "cached_at" to today)
RULE 3 — 90-day threshold is configurable via config.json "static_cache_max_age_days"
RULE 4 — When refreshing, always REPLACE the entire file (not append)
RULE 5 — Log cache status at every session start:
          "Static cache loaded. Age: X days. Next refresh in Y days."
          OR
          "Static cache expired/missing. Running full static search now."
RULE 6 — Static search re-run uses same queries as initial build (below)
```

#### Static Cache Rebuild Queries (run only when cache is missing or expired)

```
STATIC REBUILD BATCH — Adobe & Stock Platform Intelligence:
"adobe stock best selling categories [current year]"
"adobe creative trends [current year] visual report"
"shutterstock creative trends [current year]"
"getty images visual trends [current year]"
"stock photography high demand niches [current year]"
"best selling stock image styles [current year]"
"adobe stock contributor tips top keywords [current year]"
"stock photo buyer search behavior [current year]"
"photography color trends [current year]"
"design visual trends [current year] commercial"
"stock photography composition trends [current year]"
"pinterest visual trends [current year]"
"behance dribbble design trends [current year]"
"canva design trends report [current year]"
"marketing visual content trends [current year]"
```

*After running these 15 queries, parse and synthesize results into the static cache structure above. Save with current timestamp. Do not search these again until expiry.*

---

### 2F — SUB-AGENT A EXECUTION SUMMARY

```
ON EVERY SESSION START:
──────────────────────
① Check static cache → valid? → load it (skip static searches)
                     → expired/missing? → run 15 static queries → build cache → save → load

② Run 87–99 dynamic queries across 9 batches (always fresh, always current)
   Priority order: World News → Economy → Finance → Technology → Business
                   → Science/Health → Social/Culture → Environment
                   → Seasonal/Events (date-driven, relevant window only)

③ Synthesize: merge static cache intelligence + dynamic search results
   Apply scoring formula + boosters + disqualifiers

④ Output: trend_data.json with top 10–15 scored trends
   Each trend includes: score, news context, commercial use cases,
   visual keywords, composition recommendations for 16:9 AND 1:1

⑤ Hand off trend_data.json to Sub-Agent B
```

**Target output per session:**

```
- Static queries executed: 0 (cached) or 15 (first run / refresh)
- Dynamic queries executed: 87 every session
- Trends identified: 20–30
- Trends after filtering: 10–15
- Final trends passed to Sub-Agent B: 10 (highest scoring)
```

---

## PART 3 — SUB-AGENT B: DESCRIPTION GENERATOR AGENT

### Role

Takes the scored trend data from Sub-Agent A and converts each trend into multiple precise, detailed, commercially optimized image descriptions ready to be entered into Google Flow AI as generation prompts.

### Description Generation Strategy

Each trend topic produces **2 image descriptions** (one for each aspect ratio batch: 16:9 and 1:1). These are NOT the same description — they are optimized for the visual composition of each ratio:

- **16:9 descriptions** → wide, landscape-oriented, scenes with environment/context (e.g., office scenes, outdoor environments, wide product shots)
- **1:1 descriptions** → centered, portrait/square compositions (e.g., close-ups, portraits, product-focused, icon-style concepts)

### Description Quality Rules

Every description must:

1. **Be 40–120 words** — long enough to be specific, short enough to stay coherent for the AI model
2. **Lead with the visual subject** — what is in the center of the image
3. **Include lighting direction** — "soft natural window light", "golden hour backlight", "clean studio lighting", "dramatic rim lighting"
4. **Specify mood/emotion** — "confident and approachable", "calm and focused", "dynamic and energetic"
5. **Include art direction notes** — "shallow depth of field", "sharp focus", "cinematic color grading", "clean minimal background"
6. **Avoid brand names, logos, text overlays** — stock images must be brand-neutral
7. **Avoid real people descriptions** — use "diverse professional woman in her 30s" not a real name
8. **Include at least one commercial use signal** — "suitable for website hero image", "perfect for business presentation background"
9. **Never include copyrighted characters, places with IP restrictions**
10. **End with quality signal** — "photorealistic", "ultra-detailed", "high-resolution", "professional stock photography quality"

### Description Templates by Category

**Technology / AI / Business:**

```
Template: [Subject doing action] in [environment], [lighting], [mood], [camera style], [composition], photorealistic professional stock photography, suitable for [commercial use case], ultra-detailed, [color palette].
```

**Lifestyle / Wellness / Healthcare:**

```
Template: [Diverse person/people] [activity] in [setting], [natural/studio lighting], authentic expression of [emotion], [depth of field], clean background, professional stock image quality, ideal for [commercial use].
```

**Nature / Sustainability / Environment:**

```
Template: [Natural element/scene] with [modern sustainable element], [time of day], [color mood], wide angle, cinematic composition, photorealistic, suitable for [environmental brand/campaign use].
```

**Abstract / Conceptual:**

```
Template: Abstract [concept] visualized as [visual metaphor], [color palette], [lighting], [texture/material], minimal clean composition, suitable for [commercial/editorial use], professional stock quality.
```

### Example Descriptions Generated from Trend Data

**Trend: "AI-Powered Productivity"**

*16:9 description:*

> A focused diverse professional woman in her early 30s working at a sleek minimalist desk, holographic AI data visualizations floating above her laptop in a bright modern co-working space, soft natural window light from the left, shallow depth of field, confident calm expression, clean Scandinavian interior design, muted blue and white color palette, cinematic color grading, professional stock photography quality, ideal for technology company websites and productivity app advertisements.

*1:1 description:*

> Close-up portrait of a confident young White male professional in a modern office setting, a subtle glowing AI interface reflection visible in his glasses, soft studio lighting, sharp focus on face, authentic engaged expression, clean blurred background, photorealistic, professional business stock photography, perfect for technology brand campaigns and LinkedIn advertising.

**Trend: "Mental Health & Mindfulness"**

*16:9 description:*

> A serene young woman practicing mindfulness meditation on a light wood floor in a sunlit minimal apartment, golden morning light streaming through sheer curtains, eyes gently closed, peaceful authentic expression, yoga mat, green plant in background, warm neutral tones, shallow depth of field, photorealistic lifestyle photography, ideal for wellness app websites and mental health awareness campaigns.

*1:1 description:*

> Overhead flat lay of a wellness morning routine setup: ceramic mug of tea, open journal, small succulent plant, smooth river stones, lavender sprig, natural linen texture background, soft diffused studio lighting, warm earthy tones, ultra-sharp detail, clean minimal composition, professional stock photography quality, suitable for wellness brands, health blogs, and lifestyle product advertising.

### Output Format: `descriptions.json`

```json
{
  "generated_at": "YYYY-MM-DDTHH:MM:SSZ",
  "total_descriptions": "[dynamic — 2 per trend, varies by session]",
  "loop_index": 0,
  "descriptions": [
    {
      "id": 1,
      "trend_id": 1,
      "trend_topic": "AI-Powered Productivity",
      "aspect_ratio_target": "16:9",
      "prompt_text": "A focused diverse professional woman...",
      "expected_images": 4,
      "commercial_tags": ["technology", "business", "AI", "productivity"],
      "status": "pending"
    },
    {
      "id": 2,
      "trend_id": 1,
      "trend_topic": "AI-Powered Productivity",
      "aspect_ratio_target": "1:1",
      "prompt_text": "Close-up portrait of a confident young...",
      "expected_images": 4,
      "commercial_tags": ["technology", "portrait", "professional", "AI"],
      "status": "pending"
    }
  ]
}
```

**Continuous Loop Strategy:**

Descriptions are not a fixed quota. Sub-Agent B produces 2 descriptions per trend × however many trends were identified. Once Sub-Agent C finishes generating images for ALL descriptions in the current queue, it does **not** stop — it loops back to the first trend and repeats the entire process from the beginning, cycling through all descriptions again. This loop continues indefinitely until all account credits across all accounts are exhausted. There is no fixed image count per session — the system runs for as long as there is credit available. New accounts added to `accounts.json` are automatically picked up in future sessions, extending the loop capacity without any code changes.

---

## PART 4 — SUB-AGENT C: IMAGE CREATION & DOWNLOAD AGENT

### Role

Controls the Google Flow AI browser interface to generate images using the descriptions from Sub-Agent B, then downloads every generated image at 2K upscaled resolution.

### Target URL

```
https://labs.google/fx/tools/flow/project/{Project_Id}
```

**The `{Project_Id}` is NEVER hardcoded.** It changes with every account and every new project. The agent must resolve the current project ID dynamically at runtime using the following procedure:

```
PROJECT ID RESOLUTION:
─────────────────────
STEP 1: After logging in, navigate to the Flow landing page:
        https://labs.google/fx/tools/flow

STEP 2: On the landing page, locate the project list / recent projects panel
        (typically shown as image thumbnails on the left sidebar or main grid)

STEP 3: Click the FIRST / MOST RECENT project visible
        — this is always the active working project for the current session

STEP 4: Once the project page loads, read the current URL from the browser
        The URL will be in the format:
        https://labs.google/fx/tools/flow/project/[some-uuid]
        Extract and store: current_project_id = [some-uuid]

STEP 5: Save current_project_id to session_state.json under the current account
        This is the URL the agent will use for the remainder of the session

STEP 6: On account switch → repeat steps 1–5 for the new account
        Each account may have a different active project ID
```

**Never assume the project ID from a previous session or a different account is still valid.** Always resolve it fresh after each login.

### Browser Automation Core

This agent uses the browser automation framework at:

```
C:\Users\11\browser-automation-core
```

All DOM selectors must be discovered dynamically at runtime using the framework's element discovery tools, then cached to a local selectors file. See **Section 4.6 — Element Selector Registry** for the full selector map.

**Critical Note on Dynamic DOM (React/Next.js):**

> Google Flow is a React single-page application. Most interactive elements (dropdowns, modals, menus) are NOT rendered in the DOM until they are triggered by a user interaction (hover, click). Sub-Agent C MUST simulate the interaction FIRST, then wait for the DOM to update, then query the newly rendered elements. Never assume a dropdown or menu selector exists without triggering it first.

**DOM Interaction Rule:**

```
For any element that appears on hover/click:
1. Simulate hover/click on the trigger element
2. Wait for DOM mutation (MutationObserver or waitForSelector)
3. Only THEN query the child element's selector
4. Cache the discovered selector to selectors_registry.json
```

---

### 4.1 — INITIALIZATION & NAVIGATION

```
STEP 1: Browser Setup — Launch via browser-automation-core
─────────────────────────────────────────────────────────
The agent ALWAYS uses the shared debug browser session managed by the
browser-automation-core framework. Never launch a raw Chrome process directly.

Launch command:
  C:\Users\11\browser-automation-core\launch_browser.bat 9222 GoogleFlowProfile

This bat file:
  → Launches Chrome on CDP debug port 9222
  → Uses an isolated named profile "GoogleFlowProfile" (retains Google login sessions)
  → Handles --remote-debugging-port, --no-first-run, --disable-notifications flags
  → Sets viewport-friendly window size

After launching, connect via CDP:
  → CDP endpoint: http://localhost:9222
  → Use browser_core.ts → connectBrowser(9222) to attach
  → Use isDebugPortReady(9222) as health check before connecting

If the browser is ALREADY running on port 9222 (from a previous session):
  → Skip launch entirely
  → Connect directly via connectBrowser(9222)
  → Verify the port is responding: isDebugPortReady(9222) → true

Viewport: 1920×1080 (set inside launch_browser.bat via --window-size flag)
Timezone: inherits system timezone automatically

STEP 2: Navigate to Flow Project
- Navigate to: https://labs.google/fx/tools/flow (landing page first)
- Click the most recent project from the project list (see Target URL section above)
- This resolves the current account's active project URL dynamically
- Store the resolved project URL in session_state.json: current_project_url
- Wait for: page fully loaded (networkidle or DOM stable for 2s)
- Verify: page title contains "Flow" OR prompt input box is visible

STEP 3: Handle "New Image Aspect Ratios" Modal (one-time only)
- Check if modal with text "New Image Aspect Ratios" is present
- If YES → click "Get Started" button → dismiss modal
- If NO → continue normally
- This modal only appears once per account, never again
```

---

### 4.2 — SETTINGS CONFIGURATION

#### A. Open Image Settings Panel

```
TRIGGER ACTION:
- Locate the settings button in the bottom toolbar of the prompt input area
- This button sits to the LEFT of the generate/arrow button inside the prompt bar
- Its visual content varies depending on the current state:
    → If last used for IMAGE: may show a model name + aspect ratio icon + quantity
    → If last used for VIDEO: will show video-related settings — no model name at all
    → The exact text/icons on this button are NOT reliable identifiers
- Click this button to open the settings panel

DISCOVERY APPROACH:
- Do NOT rely on button text like "Nano Banana 2" or a banana emoji — these change
- Instead, identify the button by its position: it is a clickable element in the
  bottom toolbar of the prompt area, to the left of the arrow/send button
- Use structural selectors: find the toolbar container first, then locate the
  non-arrow button within it
- Once opened, the settings panel will ALWAYS contain: Image/Video tabs,
  aspect ratio buttons, quantity buttons, and model selector — use these
  inner elements to confirm the panel opened correctly

WAIT FOR: Settings panel DOM to appear (React renders it on click)
```

**Selector Discovery Note:**

```
The settings trigger button must be discovered from the live DOM.
See Section 4.6 for the selector registry and discovery protocol.
All selectors marked [DISCOVERED_AT_RUNTIME] or [DISCOVERED_AFTER_TRIGGER]
must be populated by running the selector discovery process on the live page
before this automation script can execute reliably.
```

#### B. Verify/Set Output Type to IMAGE (not Video)

```
SETTINGS PANEL — TAB SELECTION:
- Locate the tab row at top of settings panel
- Two tabs visible: [Image] | [Video]
- If "Image" tab is already selected (active/highlighted) → no action needed
- If "Video" tab is selected → click "Image" tab
- Verify: Image tab is now active
```

**Decision Logic:**

```
LOGIC (pseudocode — selectors must be resolved from live DOM before use):
─────────────────────────────────────────────────────────────────────────
Read imageTab element from selectors_registry.json → selectors.tab_image

if imageTab is active (check aria-selected="true" OR active CSS class):
    → skip, already on Image
else:
    → click imageTab
    → wait 500ms
    → verify imageTab is now active
    → if still not active → retry up to 3 times
```

> ⚠ **SELECTOR VALIDATION REQUIRED**
> The class names, `aria-selected`, and active-state attributes used above are
> **illustrative pseudocode only** — they have NOT been validated against the live
> Google Flow DOM. All selector values in this file marked `[DISCOVERED_AT_RUNTIME]`
> or `[DISCOVERED_AFTER_TRIGGER]` are placeholders until the selector discovery
> process runs against the live page (see Section 4.6).
>
> **Agent prompt to populate valid selectors:**
> ```
> Open https://labs.google/fx/tools/flow/project/[current-project-id] in the
> debug Chrome session on port 9222. Run the selector discovery protocol defined
> in Section 4.6 of this file. For every element that requires a trigger (hover/click)
> to appear in the DOM, simulate that interaction first, wait for the DOM to update,
> then extract and record the most stable selector available (prefer data-testid,
> data-*, aria-label, then id — never use auto-generated hash class names).
> Save all discovered selectors to:
> C:\AdobeStockAutomation\data\selectors_registry.json
> Set "selectors_discovered": true once all elements have been found.
> Do not proceed with image generation automation until this file is populated.
> ```

#### C. Set Aspect Ratio

The agent uses **two aspect ratios per description**, in strict order:

**First batch always: 16:9**
**Second batch always: 1:1**

```
ASPECT RATIO BUTTONS (visible after clicking settings):
- Row of aspect ratio options: [16:9] [4:3] [1:1] [3:4] [9:16]
- Click the target aspect ratio button
- Verify: selected button has active/highlighted state

For 16:9: click the "16:9" button
For 1:1: click the "1:1" button
```

**Selection Verification:**

```
After clicking aspect ratio button:
- Check that button has active/selected CSS state
- Check that NO other ratio button is active
- If verification fails → retry click → re-verify → max 3 retries
```

#### D. Set Quantity to x4

```
QUANTITY BUTTONS (visible in settings panel):
- Row: [x1] [x2] [x3] [x4]
- Target: x4 (always)
- If x4 is already selected → no action
- If not → click x4 button
- Verify: x4 has active/selected state
```

#### E. Select AI Model

**Model Priority Order:**

```
Priority 1: Nano Banana 2     (latest, highest quality — use first)
Priority 2: Nano Banana Pro   (previous version — fallback when Nano Banana 2 limit reached)
Priority 3: NEVER use Imagen 4
```

```
MODEL SELECTION PROCESS:
1. Locate the model selector dropdown (shows current model name with dropdown arrow)
2. Click the model selector to open the dropdown
3. WAIT for dropdown DOM to appear (React renders it on click)
4. In the dropdown, three options visible:
   - "Nano Banana Pro"
   - "Nano Banana 2"
   - "Imagen 4"
5. Click "Nano Banana 2" (or current priority model from state)
6. WAIT for dropdown to close
7. Verify: model selector now shows "Nano Banana 2" (or target model)
```

**State-Driven Model Selection Logic:**

```
current_model = read from session_state.json

if current_model == "Nano Banana 2":
    → select "Nano Banana 2" in dropdown
elif current_model == "Nano Banana Pro":
    → select "Nano Banana Pro" in dropdown
else:
    → default to "Nano Banana 2"
```

#### F. Close Settings Panel

```
- Click outside the settings panel (anywhere on the backdrop) OR
- Click the settings trigger button again to toggle it closed
- Verify: settings panel is no longer in DOM
```

---

### 4.3 — IMAGE CREATION LOOP

#### Overview of Full Loop Per Description

```
For each description in descriptions.json (status == "pending"):

  PHASE A — Create 16:9 batch (4 images)
  ├─ Enter description in prompt input
  ├─ Open settings → set aspect ratio to 16:9 → set x4 → set model → close settings
  ├─ Click generate button (arrow button)
  ├─ DO NOT WAIT for completion
  └─ Immediately proceed to PHASE B

  PHASE B — Create 1:1 batch (4 images) with SAME description
  ├─ Open settings → change aspect ratio to 1:1 → (x4 and model remain same) → close settings
  ├─ Click generate button (arrow button)
  ├─ DO NOT WAIT for completion
  └─ Move to next description → repeat from PHASE A

  Result: 8 images created per description (4 × 16:9, 4 × 1:1)
```

#### PHASE A — Enter Description & Create 16:9 Batch

```
STEP 1: Locate prompt input box
- Find the text input/textarea in the bottom of the Flow interface
- It is the main prompt text area where users type image descriptions

STEP 2: Clear any existing text
- Click input to focus
- Select all (Ctrl+A) → Delete

STEP 3: Type description
- Type or paste the prompt text from descriptions.json[current_index].prompt_text
- Verify: input field contains the typed text

STEP 4: Configure settings for 16:9
- Open settings panel (click settings button)
- Wait for panel DOM
- Verify/set: Image tab active
- Set aspect ratio: 16:9
- Set quantity: x4
- Set model: [current model from state]
- Close settings panel

STEP 5: Click Generate (Arrow button)
- Locate the arrow/send button (→ icon) adjacent to the prompt input
- Click it
- Verify: generation has started (a progress indicator / loading state appears)
- DO NOT wait for images to finish
- Immediately proceed to PHASE B
```

#### PHASE B — Change Aspect Ratio to 1:1 & Create Second Batch

```
STEP 1: Open settings panel again
- Click settings trigger button

STEP 2: Change aspect ratio ONLY
- Click "1:1" aspect ratio button
- Verify: 1:1 is now selected
- NOTE: x4 and model remain unchanged — only aspect ratio changes

STEP 3: Close settings panel

STEP 4: Click Generate (Arrow button) again
- The prompt input still contains the same description from PHASE A
- Click generate button
- Verify: second generation has started
- Wait 1 second (allow the UI to register the generation job before proceeding)
- DO NOT wait for generation to complete — proceed immediately after the 1s pause

STEP 5: Update state
- Mark current description as "batches_sent" in session_state.json

STEP 6: Move to next description OR loop back
- Increment current_description_index in state
- If more descriptions remain in current loop pass → go back to PHASE A with new description
- If ALL descriptions in the queue have been sent (end of current loop pass):
    → DO NOT stop
    → Increment loop_index counter in session_state.json
    → Log: "Loop [N] complete. All descriptions cycled. Starting loop [N+1]."
    → Reset current_description_index to 0
    → Go back to PHASE A with the FIRST description again (loop restart)
    → Continue until a rate limit is hit → trigger rate limit handler
    → Only stop when ALL accounts across ALL models are fully exhausted
```

#### Critical Timing Rules

```
NEVER wait for image generation to complete before sending next batch.
Google Flow generates asynchronously — multiple jobs can run in parallel.
The goal is to QUEUE all generation jobs as fast as possible, then download all results.

EXCEPTION: If the interface becomes unresponsive or shows an error modal,
wait 3 seconds and check state before proceeding.
```

---

### 4.4 — RATE LIMIT DETECTION & MODEL SWITCHING

#### Detecting Rate Limit Errors

During or after clicking Generate, monitor for any of these signals:

```
Rate Limit Signals to Detect:
1. Modal/toast message containing text like:
   - "limit reached"
   - "quota exceeded"
   - "out of credits"
   - "try again tomorrow"
   - "generation limit"
   - "daily limit"
2. Generate button becomes disabled immediately after click
3. Error state in the generation queue with a warning icon
4. Progress bar never starts after clicking Generate
```

**Detection Code Logic:**

```
After clicking Generate:
- Wait 3 seconds
- Scan DOM for error text patterns (above signals)
- If error found → RATE_LIMIT_DETECTED = true
- If no error → continue normally
```

#### Model Switching Logic

```
IF RATE_LIMIT_DETECTED:

  CASE 1: Current model is "Nano Banana 2"
  ─────────────────────────────────────────
  → Set session_state.current_account.nano_banana_2_exhausted = true
  → Switch model to "Nano Banana Pro"
  → Update session_state.current_model = "Nano Banana Pro"
  → Retry the SAME generation that failed (re-send current description + aspect ratio)
  → Log: "Switched from Nano Banana 2 to Nano Banana Pro for account [email]"
  → Continue generation loop with Nano Banana Pro

  CASE 2: Current model is "Nano Banana Pro" (both models exhausted)
  ─────────────────────────────────────────────────────────────────
  → Set session_state.current_account.nano_banana_pro_exhausted = true
  → Set session_state.current_account.fully_exhausted = true
  → Log: "Account [email] fully exhausted. Switching to next account."
  → TRIGGER ACCOUNT SWITCHING PROCEDURE (see Section 4.5)

  CASE 3: All accounts fully exhausted
  ─────────────────────────────────────
  → Log: "ALL ACCOUNTS EXHAUSTED. No more generation possible today."
  → Proceed to DOWNLOAD PHASE to collect all images created so far
  → Write final state to session_state.json
  → EXIT generation loop
```

---

### 4.5 — ACCOUNT SWITCHING PROCEDURE

When the current account has exhausted both model quotas, switch to the next available account.

#### Step-by-Step Account Switch

```
STEP 1: Locate Profile Picture
- Find the user profile picture/avatar in the TOP RIGHT CORNER of the page
- It is a circular avatar image (Google account photo)
- Click it to open the account menu popup

STEP 2: Click "Sign out"
- In the account menu popup, find the "Sign out" button
- Click "Sign out"
- Wait for: page redirects automatically to labs.google.fx landing page

STEP 3: Navigate to Flow Landing Page (if not auto-redirected)
- If redirect doesn't happen within 5 seconds → navigate to: https://labs.google/fx/tools/flow
- Wait for page load

STEP 4: Click "Create with Flow" Button
- Find the "Create with Flow" button on the landing page
- Click it
- Wait for: Google Sign-In account selector to appear

STEP 5: Handle "New Image Aspect Ratios" Modal
- After signing in, if modal "New Image Aspect Ratios" appears → click "Get Started"
- This modal may or may not appear depending on account history

STEP 6: Select Next Account
- In the Google Sign-In account chooser:
  - Read accounts list from accounts.json
  - Find the next account where fully_exhausted == false
  - Click on that account's email/name in the chooser
  - If account requires re-authentication → enter password (from secure credentials store)
  
STEP 7: Post-Login Verification
- Verify: successfully logged in (profile picture in top right matches selected account)
- Verify: URL is back to Flow project or landing page

STEP 8: Navigate to Project
- If redirected to general Flow page → click on first project image on the left sidebar
  - NOTE: The project will contain previously created images — IGNORE THEM
  - Sub-Agent C only processes NEW images created in the current session
- Update session_state.current_account_index to new account index
- Update session_state.current_model to "Nano Banana 2" (start fresh with new account)
- Log: "Switched to account [email]. Resuming generation."

STEP 9: Resume Generation Loop
- Continue from where the generation loop was interrupted
- Re-send the description+aspect-ratio batch that caused the rate limit error
```

#### Account Rotation Failsafe

```
If no accounts remain with available quota:
→ Log: "SYSTEM HALT: All [N] accounts exhausted for today."
→ Write session_state.json with all quotas marked
→ Exit generation gracefully
→ Proceed to DOWNLOAD PHASE to collect all already-created images
→ System will be ready to resume tomorrow on next run
```

---

### 4.6 — ELEMENT SELECTOR REGISTRY

All selectors must be discovered dynamically at first run and saved to `selectors_registry.json`. This avoids repeated DOM discovery on subsequent runs.

#### `selectors_registry.json` Structure

```json
{
  "last_updated": "YYYY-MM-DDTHH:MM:SSZ",
  "selectors": {
    "prompt_input": {
      "description": "Main text input where image descriptions are typed",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "fallback_text_match": "Add a description",
      "interaction": "click, then type"
    },
    "generate_button": {
      "description": "Arrow button to submit prompt and start generation",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "fallback_aria": "aria-label contains 'generate' or 'send'",
      "interaction": "click"
    },
    "settings_trigger_button": {
      "description": "Settings button in the bottom prompt toolbar, to the left of the generate/arrow button. Opens the image/video settings panel on click. Its visible text and icons vary depending on last-used mode — do NOT use text content as selector. Identify by structural position within the prompt toolbar container.",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "discovery_strategy": "Find the prompt toolbar container, then locate the non-arrow, non-input button element within it. Prefer data-testid, aria-label, or positional structural selector.",
      "interaction": "click to open settings panel"
    },
    "settings_panel_container": {
      "description": "The settings panel that appears after clicking settings trigger",
      "trigger_required": true,
      "trigger_action": "click settings_trigger_button",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "interaction": "parent container, children are tabs/buttons"
    },
    "tab_image": {
      "description": "Image tab inside settings panel",
      "trigger_required": true,
      "trigger_action": "open settings panel",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "Image",
      "interaction": "click to select"
    },
    "tab_video": {
      "description": "Video tab inside settings panel",
      "trigger_required": true,
      "trigger_action": "open settings panel",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "Video",
      "interaction": "click to select"
    },
    "aspect_ratio_16_9": {
      "description": "16:9 aspect ratio button",
      "trigger_required": true,
      "trigger_action": "open settings panel",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "16:9",
      "interaction": "click to select"
    },
    "aspect_ratio_1_1": {
      "description": "1:1 aspect ratio button",
      "trigger_required": true,
      "trigger_action": "open settings panel",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "1:1",
      "interaction": "click to select"
    },
    "quantity_x4": {
      "description": "x4 quantity button (generate 4 images)",
      "trigger_required": true,
      "trigger_action": "open settings panel",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "x4",
      "interaction": "click to select"
    },
    "model_dropdown_trigger": {
      "description": "Current model selector showing model name with dropdown arrow",
      "trigger_required": true,
      "trigger_action": "open settings panel",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "Nano Banana",
      "interaction": "click to open model dropdown"
    },
    "model_dropdown_options": {
      "description": "Dropdown list of model options",
      "trigger_required": true,
      "trigger_action": "click model_dropdown_trigger",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "interaction": "list container"
    },
    "model_nano_banana_2": {
      "description": "Nano Banana 2 option in model dropdown",
      "trigger_required": true,
      "trigger_action": "click model_dropdown_trigger",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "Nano Banana 2",
      "interaction": "click to select"
    },
    "model_nano_banana_pro": {
      "description": "Nano Banana Pro option in model dropdown",
      "trigger_required": true,
      "trigger_action": "click model_dropdown_trigger",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "Nano Banana Pro",
      "interaction": "click to select"
    },
    "profile_avatar": {
      "description": "User profile picture top right corner",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "fallback_aria": "aria-label contains 'profile' or 'account'",
      "interaction": "click to open account menu"
    },
    "account_menu_signout": {
      "description": "Sign out button in account menu popup",
      "trigger_required": true,
      "trigger_action": "click profile_avatar",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "Sign out",
      "interaction": "click to sign out"
    },
    "image_thumbnail": {
      "description": "Generated image thumbnail in the project gallery",
      "trigger_required": false,
      "selector": "[DISCOVERED_AT_RUNTIME]",
      "interaction": "hover to reveal action buttons"
    },
    "image_three_dot_menu": {
      "description": "Three-dot menu button appearing on image hover (top right of image)",
      "trigger_required": true,
      "trigger_action": "hover over image_thumbnail",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_aria": "aria-label contains 'more options' or 'menu'",
      "interaction": "click OR right-click on image to open context menu"
    },
    "download_option": {
      "description": "'Download' option in the image context menu",
      "trigger_required": true,
      "trigger_action": "right-click image OR click three_dot_menu",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "Download",
      "interaction": "hover to reveal sub-menu"
    },
    "download_2k_upscaled": {
      "description": "'2K upscaled' sub-option under Download",
      "trigger_required": true,
      "trigger_action": "hover over download_option",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "2K upscaled",
      "interaction": "click to start upscaling + auto-download"
    },
    "upscaling_indicator": {
      "description": "Loading/progress state shown while 2K upscaling is in progress",
      "trigger_required": true,
      "trigger_action": "click download_2k_upscaled",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "interaction": "wait until gone (upscaling complete)"
    }
  }
}
```

#### Selector Caching & Re-Discovery Protocol

```
FIRST RUN — DISCOVERY MODE:
─────────────────────────────────────────────────────
Runs ONCE when selectors_registry.json does not exist OR
"selectors_discovered" field is false.

1. Open the Flow project page in the debug browser
2. For each selector where trigger_required == false:
   a. Query live DOM for element matching discovery_strategy / fallback hints
   b. Extract the most stable, unique selector (priority order below)
   c. Write to selectors_registry.json

3. For each selector where trigger_required == true:
   a. Execute the trigger_action (click/hover the parent element)
   b. Wait for DOM mutation to settle (MutationObserver or waitForSelector, 2s)
   c. Query newly rendered element in DOM
   d. Extract stable selector
   e. Write to selectors_registry.json

4. Set "selectors_discovered": true in selectors_registry.json
5. Set "last_updated" timestamp

SUBSEQUENT RUNS — CACHE-FIRST MODE (default):
─────────────────────────────────────────────────────
1. At startup: load selectors_registry.json into memory — instant, no DOM access
2. Use cached selectors directly for all automation actions
3. DO NOT validate selectors against the DOM on every run — this is slow and wasteful

ON-FAILURE RE-DISCOVERY (only when an action fails):
─────────────────────────────────────────────────────
A "failure" is defined as: the agent attempted to click/interact with a cached
selector and the action produced no effect OR the element was not found.

When a failure occurs:
1. Log: "Selector failed: [selector_key] = [cached_value]. Re-discovering."
2. Re-run discovery for ONLY the specific failed selector (not the full registry)
3. Simulate the required trigger interaction to expose the element if needed
4. Extract the new selector value from the updated DOM
5. Overwrite ONLY that specific entry in selectors_registry.json
6. Update "last_updated" timestamp
7. Retry the failed action with the newly discovered selector
8. If re-discovery also fails → log error → apply retry policy (Part 6) → continue

Key rule: The DOM is NEVER scraped as a routine step. Scraping only happens:
  a. First run (discovery mode, once)
  b. On selector action failure (targeted, single-selector update only)
```

#### Selector Stability Priority

When extracting selectors, prefer in this order:

```
1. data-testid attribute      → most stable, intentionally set for testing
2. data-* custom attributes   → stable React component attributes
3. aria-label / role          → accessible, unlikely to change
4. Unique class combination   → use 2-3 specific classes, not generic ones
5. Element text content match → last resort, use contains() or exact match
6. NEVER use: index-based (nth-child), auto-generated hash classes (CSS modules)
```

---

### 4.7 — IMAGE DOWNLOAD PHASE

After all generation jobs have been queued, wait for images to appear in the project gallery, then download each one at 2K upscaled resolution.

#### Detecting When Images Are Ready

```
MONITORING STRATEGY:
- The download phase runs CONCURRENTLY with the generation loop — do not wait
  for all generation jobs to finish before starting downloads
- Poll the project gallery every 15 seconds for newly rendered image thumbnails
- An image is "ready" when:
  a. Its thumbnail is fully rendered (not a spinner/placeholder)
  b. It has not yet been processed (not in session_state.downloaded_images list)
- There is NO fixed expected count — the gallery grows continuously as long as
  generation jobs are running and accounts have credit
- Continue polling indefinitely until:
  a. The generation loop has fully stopped (all accounts exhausted), AND
  b. All remaining rendered thumbnails have been downloaded
```

#### Download Loop: For Each Ready Image

```
METHOD: Right-click context menu (fastest and most reliable)

STEP 1: Identify new, undownloaded images in gallery
- Compare gallery thumbnails against session_state.downloaded_images list
- Process images in order from newest to oldest (or any consistent order)

STEP 2: Hover over target image
- Move cursor to center of image thumbnail
- Wait: hover action menu elements appear in DOM (500ms)

STEP 3: Right-click image
- Right-click the image thumbnail
- Wait: context menu modal appears in DOM

STEP 4: Hover over "Download"
- Move cursor to the "Download" option in the context menu
- Wait: sub-menu appears with download quality options (300ms)

STEP 5: Click "2K upscaled"
- Click on "2K upscaled" option in sub-menu
- Observe: UI shows upscaling progress/indicator on that image
- Wait 1 second (allows the UI to register the request before moving on)
- DO NOT wait for upscaling to complete
- Mark the image as "upscale_requested" in session_state immediately
- Move directly to the NEXT undownloaded image and repeat Steps 2–5

STEP 6: Parallel upscaling (all images upscale simultaneously)
- Multiple 2K upscale jobs run in parallel on Google's servers — this is normal
- Once an upscale job finishes, the file downloads automatically to the
  system downloads folder (no further action needed per image)
- There is no error risk from parallel upscaling — the server handles concurrency

STEP 7: Monitor downloads folder passively
- While new upscale requests are being submitted for remaining images,
  a background watcher monitors the system downloads folder
- When a new file appears: rename it using the structured naming convention:
  Format: [trend_topic]_[aspect_ratio]_[loop_index]_[index]_[timestamp].png
  Example: ai_productivity_16x9_L2_001_20260323.png
- Move renamed file to: C:\AdobeStockAutomation\downloads\[session_date]\

STEP 8: Update state per confirmed download
- Add image to session_state.images_downloaded list
- Increment images_downloaded_count
- Log: "Downloaded: [filename]"

STEP 9: Continue submitting upscale requests for all remaining ready images
- Do not pause between images while waiting for any prior upscale to finish
- The goal: submit all 2K upscale requests as fast as possible, let them
  all process in parallel, collect downloads as they arrive automatically
```

#### Download Concurrency Strategy

```
PARALLEL UPSCALING with a 1-second pace gap between requests.

Submit 2K upscale requests back-to-back with a 1-second wait between each one.
This gives the UI just enough time to register each request before the next click,
preventing missed interactions on fast machines while still running all upscales
in parallel on the server side.

Correct behavior:
  Image 1 → right-click → 2K upscaled → Wait 1 second → next image
  Image 2 → right-click → 2K upscaled → Wait 1 second → next image
  Image 3 → right-click → 2K upscaled → Wait 1 second → next image
  ... (all images submitted with a 1s gap between each)
  Downloads arrive in the background as each upscale completes on the server

Incorrect behavior (do NOT do this):
  ✗ Click 2K upscaled on Image 1 → wait for download to complete → then click Image 2
  ✗ Waiting more than 1–2 seconds between upscale requests
  ✗ Checking upscale progress or download status before moving to next image
```

#### Download Verification

```
Since the session runs as a continuous loop with no fixed image target:
1. After the generation loop fully stops (all accounts exhausted):
   - Continue polling the gallery for any remaining ready-but-not-yet-downloaded images
   - Submit 2K upscale requests for any missed images
   - Wait for all pending downloads to arrive (monitor downloads folder)
2. Once no new images appear in the gallery for 2 consecutive poll cycles (30s):
   - Consider the download phase complete
3. Log final summary:
   "Session complete. [N] images downloaded to [output_folder]. [N] loop passes completed."
4. Write final counts to session_state.json and automation_log.txt
```

---

## PART 5 — FULL EXECUTION FLOW DIAGRAM

```
═══════════════════════════════════════════════════════
  STEP 0 — MANDATORY PRE-BOOT (nothing runs before this)
═══════════════════════════════════════════════════════
READ: C:\AdobeStockAutomation\data\STOCK_SUCCESS_REPORT.md
  │
  ├── File NOT found? ──► LOG: "CRITICAL: Report missing. Halting." ──► EXIT
  │
  └── File found + read successfully?
      ──► LOG: "Strategy knowledge base loaded."
      ──► Load into memory: niche priorities, algorithm rules,
          keyword architecture, quality standards, commercial frameworks
      ──► PROCEED ↓

SYSTEM START
     │
     ▼
Load session_state.json
     │
     ▼
Check account quotas
     │
     ├── All exhausted? ──YES──► LOG: "All quotas exhausted" ──► EXIT
     │
     NO
     ▼
SUB-AGENT A: Trend Research & Intelligence
──────────────────────────────────────────
STEP 1 — STATIC CACHE CHECK:
  Does static_knowledge_cache.json exist AND age < 90 days?
  │
  ├── YES (cache valid) ──► Load cache into memory
  │                         LOG: "Cache loaded. Age: X days."
  │                         Skip all static searches entirely ──────────┐
  │                                                                      │
  └── NO (missing/expired) ──► Run 15 static rebuild queries            │
                               Parse + synthesize results               │
                               Save to static_knowledge_cache.json      │
                               LOG: "Cache built and saved."            │
                               Load into memory ──────────────────────► │
                                                                        ▼
STEP 2 — DYNAMIC SEARCH (always runs):
Run 87–99 queries across 9 priority batches:
  Batch 1: World News & Geopolitics       (10 queries)
  Batch 2: Economy & Markets              (10 queries)  ← PRIMARY FOCUS
  Batch 3: Money, Finance & Fintech       (12 queries)  ← PRIMARY FOCUS
  Batch 4: Technology & Innovation        (15 queries)  ← PRIMARY FOCUS
  Batch 5: Business & Corporate           (10 queries)
  Batch 6: Science, Health & Medicine     (10 queries)
  Batch 7: Social, Cultural & Lifestyle   (10 queries)
  Batch 8: Environment & Climate          (10 queries)
  Batch 9: Seasonal Events & Holidays     (3–12 queries, date-driven)
     │
     ▼
STEP 3 — SYNTHESIS:
Merge static cache + dynamic results
Apply scoring formula + boosters + disqualifiers
Cross-reference against STOCK_SUCCESS_REPORT.md chapters
Sort by score → Take top 10–15
     │
     ▼
Output: trend_data.json
     │
     ▼
SUB-AGENT B: Description Generator
─────────────────────────────────────
For each trend:
  → Create 16:9 optimized description
  → Create 1:1 optimized description
     │
     ▼
Output: descriptions.json (2 per trend, no fixed total)
     │
     ▼
SUB-AGENT C: Image Creation Agent
───────────────────────────────────
BROWSER SETUP:
  → Check if debug browser already running on port 9222
  → If not: launch C:\Users\11\browser-automation-core\launch_browser.bat 9222 GoogleFlowProfile
  → Connect via CDP: connectBrowser(9222)
  → Health check: isDebugPortReady(9222)

SELECTOR CHECK:
  → Load selectors_registry.json
  → If "selectors_discovered" == false → run full discovery protocol (Section 4.6)
  → If already discovered → use cached selectors directly

NAVIGATE:
  → Go to https://labs.google/fx/tools/flow
  → Click most recent project → read URL → store current_project_id
  → Handle "New Aspect Ratios" modal if present → click "Get Started"

SETTINGS VERIFICATION:
  → Open settings panel
  → Ensure Image tab is selected (not Video)
  → Ensure x4 quantity is selected
  → Ensure correct model is selected (Nano Banana 2 by default)
  → Close settings panel
     │
     ▼
╔══════════════════════════════════════════════════════╗
║         INFINITE GENERATION LOOP                     ║
║  Runs until ALL accounts + ALL models are exhausted  ║
╚══════════════════════════════════════════════════════╝
     │
     ▼
loop_index = 0
current_description_index = 0
     │
     ▼
FOR EACH description (cycling — restarts from 0 when all done):
  │
  ├─ PHASE A: Enter description
  │           Open settings → set 16:9 → verify x4 + model → close
  │           Click Generate → DO NOT WAIT → proceed immediately
  │
  └─ PHASE B: Open settings → change to 1:1 → close
              Click Generate → DO NOT WAIT → proceed immediately
              Mark description "batches_sent" in state
              │
              ▼
              More descriptions? → YES → next description (PHASE A)
                                 → NO (end of queue) →
                                   loop_index++
                                   LOG: "Loop [N] complete. Restarting."
                                   Reset index to 0
                                   Restart from first description
     │
     ▼ (RUNS IN PARALLEL with generation loop — not sequential)
DOWNLOAD PHASE (concurrent background process):
────────────────────────────────────────────────
Poll gallery every 15s for newly rendered thumbnails
For each new ready image:
  → right-click → Download → 2K upscaled → DO NOT WAIT → next image
  → All upscale jobs run in parallel on server
  → Files auto-download as each upscale completes
  → Background watcher renames + moves each file to output folder
  → Update session_state per confirmed download
     │
     ▼ (triggered at any point during the generation loop)
RATE LIMIT HANDLER:
────────────────────
If Nano Banana 2 limit reached:
  → session_state: nano_banana_2_exhausted = true
  → Switch model to Nano Banana Pro
  → LOG: "Model switched → Nano Banana Pro"
  → Resume generation loop from interrupted point

If Nano Banana Pro ALSO exhausted (current account fully done):
  → session_state: fully_exhausted = true for this account
  → LOG: "Account [email] exhausted. Switching account."
  → Sign out of current account
  → Navigate to: https://labs.google/fx/tools/flow → "Create with Flow"
  → Sign in with next non-exhausted account from accounts.json
  → Handle "New Aspect Ratios" modal if present
  → Resolve new project ID dynamically
  → Reset model to Nano Banana 2
  → Resume generation loop

If ALL accounts fully exhausted:
  → LOG: "SYSTEM HALT: All accounts and models exhausted."
  → EXIT generation loop
  → Let download phase finish all pending upscales
  → Proceed to session complete
     │
     ▼
SESSION COMPLETE
─────────────────
Wait for all pending downloads to finish (2 empty poll cycles = done)
Update session_state.json (final)
Write automation_log.txt summary:
  - Date/time
  - Report file read: confirmed
  - Static cache status + age
  - Dynamic queries run: 87
  - Trend topics used
  - Loop passes completed: [N]
  - Total images created
  - Total images downloaded
  - Accounts used + exhaustion status
  - Output folder path
  - Errors encountered

Pass output folder path to 02_IMAGE_UPSCALER.md
EXIT
```

---

## PART 6 — ERROR HANDLING & RECOVERY

### Error Classification


| Error Type                       | Detection                           | Recovery Action                  |
| -------------------------------- | ----------------------------------- | -------------------------------- |
| Page load failure                | Timeout >30s, no DOM response       | Reload page, retry 3×            |
| Selector not found               | querySelector returns null          | Re-run selector discovery        |
| Modal/popup blocking interaction | Unexpected overlay in DOM           | Dismiss overlay, log, retry      |
| Generation job silent failure    | No new images after 5 min           | Re-submit description            |
| Download failure                 | File not in downloads after 60s     | Retry download from gallery      |
| Login session expired            | Redirected to login page            | Re-login with current account    |
| Network timeout                  | Request timeout exception           | Wait 10s, retry 3×               |
| Rate limit false positive        | Error shown but generation proceeds | Log warning, continue monitoring |


### Retry Policy

```
Global Retry Config:
- max_retries: 3
- retry_delay_base: 2 seconds
- retry_delay_multiplier: 2 (exponential backoff)
- Retry delays: 2s → 4s → 8s

After 3 failed retries on any single action:
→ Log error to automation_log.txt
→ Skip current image/action
→ Continue with next item in queue
→ Never let a single failure halt the entire session
```

---

## PART 7 — OUTPUT FOLDER STRUCTURE

```
C:\AdobeStockAutomation\
│
├── downloads\
│   └── [YYYY-MM-DD]\
│       ├── ai_finance_16x9_L1_001_20260323.png
│       ├── ai_finance_1x1_L1_002_20260323.png
│       ├── climate_tech_16x9_L1_003_20260323.png
│       └── ...  (no fixed count — grows until all credits exhausted)
│
├── data\
│   ├── STOCK_SUCCESS_REPORT.md          ← READ FIRST on every session (Step 0)
│   ├── session_state.json               ← updated continuously during session
│   ├── trend_data.json                  ← regenerated every session
│   ├── descriptions.json                ← regenerated every session (2 per trend)
│   ├── accounts.json                    ← manually maintained, add accounts freely
│   ├── selectors_registry.json          ← built ONCE, updated only on selector failure
│   └── static_knowledge_cache.json      ← built ONCE, refreshed every 90 days
│
├── logs\
│   ├── automation_log_[YYYY-MM-DD].txt
│   └── cache_build_log_[YYYY-MM-DD].txt
│
└── [depends on] C:\Users\11\browser-automation-core\
    ├── launch_browser.bat               ← called to start CDP debug browser
    ├── launch_browser.ps1
    ├── browser_core.ts                  ← connectBrowser, fastClick, fastFill, etc.
    └── selector_store.ts                ← selector caching pattern (reference)
```

---

## PART 8 — CONFIGURATION CONSTANTS

```json
{
  "config": {
    "success_report_path": "C:\\AdobeStockAutomation\\data\\STOCK_SUCCESS_REPORT.md",
    "success_report_required": true,
    "browser_automation_core": "C:\\Users\\11\\browser-automation-core",
    "launch_browser_bat": "C:\\Users\\11\\browser-automation-core\\launch_browser.bat",
    "cdp_port": 9222,
    "chrome_profile_name": "GoogleFlowProfile",
    "flow_landing_url": "https://labs.google/fx/tools/flow",
    "flow_project_url_template": "https://labs.google/fx/tools/flow/project/{Project_Id}",
    "flow_project_id": "[RESOLVED_DYNAMICALLY_AT_RUNTIME — never hardcode]",
    "output_folder": "C:\\AdobeStockAutomation\\downloads",
    "data_folder": "C:\\AdobeStockAutomation\\data",
    "logs_folder": "C:\\AdobeStockAutomation\\logs",
    "static_cache_file": "C:\\AdobeStockAutomation\\data\\static_knowledge_cache.json",
    "selectors_registry_file": "C:\\AdobeStockAutomation\\data\\selectors_registry.json",
    "static_cache_max_age_days": 90,
    "static_cache_force_refresh": false,
    "dynamic_search_batches": 9,
    "dynamic_queries_per_session": "87–99 (varies by seasonal batch size)",
    "dynamic_batch_parallelism": 5,
    "priority_search_domains": ["economy", "finance", "technology", "world_news", "business"],
    "viewport_width": 1920,
    "viewport_height": 1080,
    "models_priority": ["Nano Banana 2", "Nano Banana Pro"],
    "aspect_ratios": ["16:9", "1:1"],
    "images_per_generation_batch": 4,
    "descriptions_per_trend": 2,
    "generation_loop": "infinite — runs until all account credits exhausted",
    "upscaling_mode": "parallel — submit all 2K requests without waiting",
    "poll_interval_seconds": 15,
    "dom_settle_ms": 500,
    "page_load_timeout_ms": 30000,
    "retry_max": 3,
    "retry_base_delay_ms": 2000,
    "next_pipeline_file": "02_IMAGE_UPSCALER.md"
  }
}
```

---

## HANDOFF TO 02_IMAGE_UPSCALER

Upon session completion (or when the generation loop pauses between account switches), this system writes to `session_state.json`:

```json
{
  "file_01_status": "complete",
  "handoff_to_02_upscaler": {
    "images_ready_for_processing": true,
    "images_folder": "C:\\AdobeStockAutomation\\downloads\\[YYYY-MM-DD]",
    "images_downloaded_count": "[dynamic — no fixed number]",
    "loop_passes_completed": "[N]",
    "trend_topics_used": ["AI Finance", "Climate Tech", "..."],
    "descriptions_reference": "C:\\AdobeStockAutomation\\data\\descriptions.json"
  }
}
```

`02_IMAGE_UPSCALER.md` reads this handoff block to know which folder to process and passes its output to `03_METADATA_OPTIMIZER.md`.

---

*FILE 01 END — TREND RESEARCH & IMAGE CREATION AUTOMATION*
*Next: 02_IMAGE_UPSCALER.md → 03_METADATA_OPTIMIZER.md*