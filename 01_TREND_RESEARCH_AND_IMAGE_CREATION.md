# 01 — TREND RESEARCH & IMAGE CREATION AUTOMATION

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
          ┌─────────────────┼──────────────────────┬──────────────────┐
          ▼                 ▼                       ▼                  ▼
  [SUB-AGENT A]      [SUB-AGENT B]          [SUB-AGENT C]      [SUB-AGENT D]
  Trend Research     Description            Image Creation     Metadata
  & Intelligence     Generator              & Download         Generator
  Agent              Agent                  Agent              Agent
          │                 │                       │                  │
          └─────────────────┼───────────────────────┴──────────────────┘
                            ▼
                    [STATE MANAGER]
                    session_state.json
                    (tracks progress,
                     rate limits,
                     accounts,
                     image count)

  All agents above operate with STOCK_SUCCESS_REPORT.md
  loaded in memory as their strategic decision-making foundation.

  Sub-Agent D fires immediately after each image is confirmed downloaded.
  It writes a .metadata.json sidecar file alongside each image file.
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
- Sub-Agent D (Metadata Generator) fires automatically after each confirmed download — no manual trigger needed
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
         Sub-Agent D → auto-fires after each confirmed download (no explicit launch needed)
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
  "current_step": "STEP_1_GENERATE_16x9",
  "loop_index": 0,
  "current_description_index": 0,
  "descriptions_queue": [],
  "images_created_count": 0,
  "images_downloaded_count": 0,
  "upscale_requested_ids": [],
  "downloaded_images": [],
  "current_16x9_submitted": [],
  "current_16x9_rendered": [],
  "current_16x9_downloaded": [],
  "current_1x1_submitted": [],
  "current_1x1_rendered": [],
  "current_1x1_downloaded": [],
  "limit_reached_on_image": false,
  "partial_download_required": false,
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

Takes the scored trend data from Sub-Agent A and converts each trend into a **series of 8 individually-crafted image descriptions**, each targeting a specific angle, composition, and framing. Every description is unique — no two descriptions in a series are alike. This directly implements the series strategy from `STOCK_SUCCESS_REPORT.md` Chapter 5.3, which produces the highest earnings-per-concept on Adobe Stock through the platform's "similar images" cross-promotion engine and multi-license buyer behaviour.

---

### Why Series-Based Descriptions Beat Repeated Generations

> From STOCK_SUCCESS_REPORT.md Chapter 5.3 — Recommended series structures:
> - 1 wide 16:9 establishing shot + 1 close-up detail + 1 overhead/aerial + 1 portrait-orientation — covering all buyer crop needs
> - Same concept, 3 different demographic groups — covering inclusive buyer requirements
> - Same subject, 3 different moods (optimistic, focused, concerned) — covering editorial versatility

**Why this is worth the trade-off of one-by-one generation:**
- Buyers who license one angle from a series license 2–5 more in the same session
- Adobe's "similar images" engine cross-promotes all images in a series to every buyer who views any one of them — free additional impressions
- Diverse angles cover ALL buyer format needs: website hero, social post, editorial, product mockup, print banner — one concept sells everywhere
- Conservative estimate: **series approach increases per-concept earnings by 2–3×** compared to 4 identical generations of the same prompt
- The speed cost is minimal — generation credits are consumed identically (8 × x1 = same as 2 × x4), only the click sequence is slightly different

---

### The 8-Description Series Structure Per Trend

Each trend generates exactly **8 descriptions** — 4 optimized for 16:9 and 4 for 1:1. Each has a named **angle slot** that defines its composition identity:

```
TREND TOPIC: [e.g., "AI-Driven Financial Decision Making"]
│
├── 16:9 GROUP (landscape/widescreen — 4 individual descriptions)
│   ├── Slot 16A — ESTABLISHING SHOT
│   │   Wide scene, full environmental context, subject + setting together,
│   │   multiple elements visible, cinematic composition. Best for: website
│   │   hero images, banner ads, presentation backgrounds.
│   │
│   ├── Slot 16B — CLOSE-UP DETAIL
│   │   Tight shot on a key element — hands, face, screen, object, texture.
│   │   Shallow depth of field. Eliminates environment. Best for: editorial
│   │   inserts, social media, product detail advertising.
│   │
│   ├── Slot 16C — OVERHEAD / AERIAL
│   │   Bird's-eye top-down perspective of the scene or subject.
│   │   Flat, graphic, pattern-rich. Best for: infographic backgrounds,
│   │   lifestyle editorial, premium magazine layouts.
│   │
│   └── Slot 16D — MOOD / DEMOGRAPHIC VARIANT
│       Same concept as 16A but with a different demographic group OR
│       a distinctly different emotional tone (optimistic ↔ focused ↔ concerned).
│       Covers inclusive buyer requirements. Best for: diversity-focused
│       campaigns, HR platforms, healthcare, education brands.
│
└── 1:1 GROUP (square — 4 individual descriptions)
    ├── Slot 1A — PORTRAIT / CENTERED
    │   Subject centered in square frame, strong single focal point.
    │   Clean background, subject fills 60-70% of frame. Best for:
    │   Instagram posts, LinkedIn ads, app store graphics.
    │
    ├── Slot 1B — EXTREME CLOSE-UP / INTIMATE DETAIL
    │   Face, hands, or a single symbolic object fills the square.
    │   Maximum intimacy, high emotional impact. Best for: profile headers,
    │   editorial thumbnails, emotional brand campaigns.
    │
    ├── Slot 1C — FLAT-LAY / TOP-DOWN LIFESTYLE
    │   Overhead square composition of objects, lifestyle items, tools
    │   relevant to the concept. Clean surface, styled arrangement.
    │   Best for: lifestyle blogs, product pages, Instagram flat-lays.
    │
    └── Slot 1D — CULTURAL / DEMOGRAPHIC VARIANT
        Same concept as 1A but with a different demographic, age group,
        or cultural context. Ensures inclusive portfolio coverage.
        Best for: global campaigns, multicultural advertising.
```

---

### Description Quality Rules (unchanged, applied to every slot)

Every description must:

1. **Be 40–120 words** — long enough to be specific, short enough to stay coherent
2. **Lead with the composition type** — what angle and framing this image uses
3. **Lead with the visual subject** — what is in the center of the image
4. **Include lighting direction** — "soft natural window light", "golden hour backlight", "clean studio lighting", "dramatic rim lighting"
5. **Specify mood/emotion** — "confident and approachable", "calm and focused", "dynamic and energetic"
6. **Include art direction notes** — "shallow depth of field", "sharp focus", "cinematic color grading", "clean minimal background"
7. **Avoid brand names, logos, text overlays** — stock images must be brand-neutral
8. **Avoid real people descriptions** — use "diverse professional woman in her 30s" not a real name
9. **Include at least one commercial use signal** — "suitable for website hero image", "perfect for business presentation background"
10. **Never include copyrighted characters or IP-restricted locations**
11. **End with quality signal** — "photorealistic", "ultra-detailed", "professional stock photography quality"

---

### Description Templates by Angle Slot

**Slot 16A — Establishing Shot (16:9):**
```
[Wide scene] showing [subject + multiple contextual elements] in [full environment],
[lighting direction], [mood], shallow depth of field pulling focus to [primary subject],
wide cinematic composition, [color palette], photorealistic professional stock,
suitable for [website hero / banner ad / presentation background].
```

**Slot 16B — Close-Up Detail (16:9):**
```
Tight close-up of [specific element — hands/screen/face/object] belonging to
[subject context], [macro/shallow DOF details], [texture/material description],
[lighting], [mood conveyed by the detail alone], horizontal format,
professional stock photography, ideal for [editorial insert / social ad].
```

**Slot 16C — Overhead / Aerial (16:9):**
```
Bird's-eye overhead view of [subject/scene from above], [flat graphic elements visible],
[color-coordinated arrangement], [lighting — soft diffused or natural daylight],
top-down perspective, clean [surface/background], pattern-rich composition,
photorealistic, professional stock, perfect for [infographic background / magazine layout].
```

**Slot 16D — Mood / Demographic Variant (16:9):**
```
[Same scene as 16A but with different demographic: e.g., "older South Asian man" /
different mood: e.g., "visibly concerned expression" / different cultural context],
[environment matching the concept], [lighting], [mood/expression that differs from 16A],
wide scene composition, photorealistic professional stock photography,
suitable for [inclusive advertising / editorial / HR campaigns].
```

**Slot 1A — Portrait / Centered (1:1):**
```
Centered portrait of [subject] in [setting], subject fills most of the square frame,
[lighting — studio or environmental], [authentic expression/mood],
clean blurred background, square composition, sharp focus on subject,
photorealistic professional stock, ideal for [Instagram ad / LinkedIn / app icon].
```

**Slot 1B — Extreme Close-Up / Intimate Detail (1:1):**
```
Extreme close-up of [face / hands / single symbolic object] related to [concept],
[texture details], [lighting that emphasizes texture/emotion],
fills entire square frame, shallow depth of field, intimate emotional impact,
professional stock photography, suitable for [profile header / emotional brand campaign].
```

**Slot 1C — Flat-Lay / Top-Down Lifestyle (1:1):**
```
Overhead flat-lay of [lifestyle objects related to concept] arranged on [clean surface],
[color-coordinated items], [natural diffused lighting from above],
top-down square composition, styled minimal arrangement, ultra-sharp detail,
professional stock photography quality, perfect for [lifestyle blog / product page / social media].
```

**Slot 1D — Cultural / Demographic Variant (1:1):**
```
Centered portrait of [different demographic: e.g., "elderly East Asian woman" /
"teenage mixed-race student" / "Middle Eastern professional in traditional dress"],
[same core concept as 1A but visually distinct demographic/cultural representation],
[setting], [lighting], authentic expression, square format,
photorealistic professional stock, suitable for [global multicultural campaigns].
```

---

### Full Example — Trend: "AI-Driven Financial Decision Making"

**16A — Establishing Shot (16:9):**
> Wide shot of a modern trading floor transformed by AI — diverse team of financial professionals in their 30s–40s reviewing holographic data visualizations floating above curved monitor arrays, soft cool-blue overhead lighting, confident focused expressions, dynamic workplace energy, cinematic color grading with blue and gold tones, photorealistic professional stock photography, ideal for fintech company website hero images and banking app advertisements.

**16B — Close-Up Detail (16:9):**
> Extreme close-up of a professional's hands typing on a keyboard with transparent financial data — stock charts, AI analytics graphs, percentage indicators — reflecting across their fingertips and the glass surface, shallow depth of field, dramatic blue rim lighting, horizontal format, ultra-sharp focus on the hands and data, photorealistic professional stock, ideal for technology editorial and financial services advertising.

**16C — Overhead / Aerial (16:9):**
> Bird's-eye overhead view of a finance professional's clean minimalist desk — laptop showing AI dashboard, printed charts, a coffee cup, smartphone, notepad, and pen arranged in a purposeful composition on a white marble surface, natural diffused window light, muted blue-grey and warm gold accent tones, flat graphic layout, photorealistic professional stock photography, perfect for business blog header and fintech infographic backgrounds.

**16D — Mood Variant (16:9):**
> Wide shot of a middle-aged South Asian woman financial analyst studying AI-generated market projections on a large curved screen in a dimly lit home office, visibly tense and concerned expression, dramatic side lighting with cool blue tones, shallow depth of field on her face against the glowing screen, authentic emotional moment, photorealistic professional stock photography, suitable for editorial journalism and economic uncertainty campaign visuals.

**1A — Portrait / Centered (1:1):**
> Centered portrait of a confident young Black male investment banker in a sharp navy suit, smartphone showing AI financial app in hand, modern glass office background softly blurred, clean studio lighting, composed and assured expression, subject fills square frame, sharp focus on face and phone screen, photorealistic professional stock, ideal for LinkedIn advertising and financial services mobile app graphics.

**1B — Extreme Close-Up (1:1):**
> Extreme close-up of a human eye reflecting a glowing AI stock market interface — green line charts and data streams visible in the iris, macro detail, dramatic dark background, single focused catch-light, fills entire square frame, ultra-sharp with cinematic contrast, symbolic and conceptual, professional stock photography quality, perfect for technology brand campaigns and AI editorial thumbnails.

**1C — Flat-Lay (1:1):**
> Overhead flat-lay of financial planning tools: open laptop showing AI analytics dashboard, leather wallet, gold pen, printed bar charts, smartphone with trading app, small potted cactus on a clean white marble surface, soft natural window light, warm gold and cool grey color palette, square composition, ultra-sharp detail, professional stock photography, ideal for personal finance blogs and wealth management platform product pages.

**1D — Cultural Variant (1:1):**
> Centered portrait of an elderly Japanese woman financial advisor in professional attire reviewing AI-generated investment reports on a tablet, warm natural office lighting, calm and knowledgeable expression, silver hair, traditional detail in background, square composition, photorealistic professional stock photography, suitable for multicultural financial advertising and global wealth management campaigns.

---

### Output Format: `descriptions.json`

```json
{
  "generated_at": "YYYY-MM-DDTHH:MM:SSZ",
  "total_descriptions": "[dynamic — 8 per trend × number of trends]",
  "loop_index": 0,
  "descriptions_per_trend": 8,
  "series_structure": {
    "16:9_slots": ["16A_establishing", "16B_close_up", "16C_overhead", "16D_mood_variant"],
    "1:1_slots": ["1A_portrait", "1B_extreme_close_up", "1C_flatlay", "1D_demographic_variant"]
  },
  "descriptions": [
    {
      "id": 1,
      "trend_id": 1,
      "trend_topic": "AI-Driven Financial Decision Making",
      "series_slot": "16A_establishing",
      "aspect_ratio": "16:9",
      "quantity": 1,
      "prompt_text": "Wide shot of a modern trading floor transformed by AI...",
      "commercial_tags": ["fintech", "AI", "finance", "diverse"],
      "status": "pending"
    },
    {
      "id": 2,
      "trend_id": 1,
      "trend_topic": "AI-Driven Financial Decision Making",
      "series_slot": "16B_close_up",
      "aspect_ratio": "16:9",
      "quantity": 1,
      "prompt_text": "Extreme close-up of a professional's hands typing...",
      "commercial_tags": ["technology", "finance", "detail", "hands"],
      "status": "pending"
    },
    {
      "id": 3,
      "trend_id": 1,
      "series_slot": "16C_overhead",
      "aspect_ratio": "16:9",
      "quantity": 1,
      "prompt_text": "Bird's-eye overhead view of a finance professional's desk...",
      "commercial_tags": ["flatlay", "finance", "overhead", "workspace"],
      "status": "pending"
    },
    {
      "id": 4,
      "trend_id": 1,
      "series_slot": "16D_mood_variant",
      "aspect_ratio": "16:9",
      "quantity": 1,
      "prompt_text": "Wide shot of a middle-aged South Asian woman financial analyst...",
      "commercial_tags": ["diverse", "editorial", "emotion", "finance"],
      "status": "pending"
    },
    {
      "id": 5,
      "trend_id": 1,
      "series_slot": "1A_portrait",
      "aspect_ratio": "1:1",
      "quantity": 1,
      "prompt_text": "Centered portrait of a confident young Black male investment banker...",
      "commercial_tags": ["portrait", "diverse", "finance", "professional"],
      "status": "pending"
    },
    {
      "id": 6,
      "trend_id": 1,
      "series_slot": "1B_extreme_close_up",
      "aspect_ratio": "1:1",
      "quantity": 1,
      "prompt_text": "Extreme close-up of a human eye reflecting a glowing AI stock market interface...",
      "commercial_tags": ["conceptual", "AI", "editorial", "technology"],
      "status": "pending"
    },
    {
      "id": 7,
      "trend_id": 1,
      "series_slot": "1C_flatlay",
      "aspect_ratio": "1:1",
      "quantity": 1,
      "prompt_text": "Overhead flat-lay of financial planning tools...",
      "commercial_tags": ["flatlay", "lifestyle", "finance", "overhead"],
      "status": "pending"
    },
    {
      "id": 8,
      "trend_id": 1,
      "series_slot": "1D_demographic_variant",
      "aspect_ratio": "1:1",
      "quantity": 1,
      "prompt_text": "Centered portrait of an elderly Japanese woman financial advisor...",
      "commercial_tags": ["diverse", "multicultural", "portrait", "finance"],
      "status": "pending"
    }
  ]
}
```

---

**Continuous Loop Strategy:**

Descriptions are not a fixed quota. Sub-Agent B produces 8 descriptions per trend. Once Sub-Agent C finishes the create→download cycle for ALL descriptions in the current queue, it loops back to the first trend and repeats the entire process. This loop continues indefinitely until all account credits across all accounts are exhausted. New accounts added to `accounts.json` are automatically picked up, extending the loop capacity without any code changes.

---

## PART 3.5 — SUB-AGENT D: METADATA GENERATION AGENT

### Role

Fires immediately after each image is confirmed downloaded in Sub-Agent C. For every downloaded image, Sub-Agent D writes a `.metadata.json` sidecar file alongside the image in the output folder. This sidecar contains the complete Adobe Stock submission metadata — title, keywords, category, AI disclosure, file type, and series context — derived entirely from the generation context that already exists in memory (trend data, series slot, description text). No visual analysis of the image is performed. Context is richest at the moment of creation; this is when metadata is written.

This implements **Method 1** from the architecture decision: metadata is created immediately after image creation, travels with the image through upscaling and upload, and is applied by `03_METADATA_OPTIMIZER.md` without needing to reverse-engineer content from pixels.

---

### When Sub-Agent D Fires

```
TRIGGER: Each time Sub-Agent C's background file watcher confirms a new
         image file has arrived in the downloads folder

TIMING:  Runs in parallel with download activity — does not block or delay
         the generation loop. While Sub-Agent C is submitting upscale requests
         for the next images, Sub-Agent D is writing sidecar files for the
         images that already downloaded.

INPUT:   For each downloaded image file, Sub-Agent D receives:
  - The filename (encodes trend topic, series slot, loop index, timestamp)
  - The original prompt text (from descriptions.json for that slot)
  - The trend data record (commercial tags, use cases, visual keywords)
  - The series slot identity (16A, 16B, 1C, etc.)
  - The aspect ratio (16:9 or 1:1)
  - The AI generation flag (always true for Flow-generated images)

OUTPUT:  One .metadata.json sidecar file per image, saved alongside the image:
  Path: C:\AdobeStockAutomation\downloads\[session_date]\[image_name].metadata.json
```

---

### Metadata Construction Rules

Sub-Agent D applies the full knowledge from `STOCK_SUCCESS_REPORT.md` Chapters 3 and 4 to construct metadata. Every field is written to the best quality achievable from the known generation context.

#### Title Construction (Chapter 4.1 rules)

```
Rules:
- Under 70 characters
- Lead with primary subject noun
- Include action/state + setting/context + differentiating modifier
- No punctuation except commas
- No "stock photo of", "image of", "AI generated" in the title
- Title must read as a buyer search query, not a description

Source inputs for title:
  - Series slot identity → determines the composition framing
  - Trend topic → determines the primary subject domain
  - Prompt text → provides specific subject, setting, demographic, mood details
  - Commercial tags → provide industry and use-case context

Title construction logic by series slot:
  16A (Establishing):  "[Subject] in [Setting], [Context Descriptor]"
  16B (Close-up):      "[Detail Subject] Close-Up, [Mood/Industry Context]"
  16C (Overhead):      "[Subject] Overhead View, [Setting/Style]"
  16D (Variant):       "[Demographic] [Subject] in [Setting], [Editorial Context]"
  1A  (Portrait):      "[Demographic] [Subject] [Action/State], [Context]"
  1B  (Extreme CU):    "[Detail] [Concept] Macro, [Industry/Commercial Context]"
  1C  (Flat-lay):      "[Subject] Flat Lay, [Setting/Style Descriptor]"
  1D  (Demo Variant):  "[Demographic] [Subject] [Action], [Cultural Context]"
```

#### Keyword Construction (Chapter 4.2 — 35-keyword blueprint)

```
Slot assignment:
  Slots 1–3:   Most specific buyer-intent phrases (from trend commercial_use_cases)
  Slots 4–7:   Long-tail conceptual phrases (from prompt text + trend visual_keywords)
  Slots 8–12:  Descriptive keywords (setting, action, mood — extracted from prompt)
  Slots 13–20: Conceptual keywords (from trend topic + commercial tags + STOCK_SUCCESS_REPORT niches)
  Slots 21–28: Technical/format descriptors (aspect ratio, composition, lighting — from prompt)
  Slots 29–35: Industry + use-case tags (from trend commercial_use_cases + buyer archetype match)

Rules:
  - 25–35 total keywords (never fewer than 25)
  - Singular nouns where possible
  - No repeated words across slots
  - First 10 must be the strongest buyer-intent phrases
  - Include: subject, action, setting, mood, industry, demographic (if present), concept, use case
```

#### Category Selection (Chapter 4.4 rules)

```
Use the most specific category available.
Map from trend category + series slot:

  Technology × Finance trends     → "Business" or "Technology"
  Healthcare trends               → "Healthcare & Medicine"
  Lifestyle / Wellness            → "Lifestyle" or "Health & Beauty"
  Conceptual/Abstract             → "Concepts & Metaphors"
  Environment / Sustainability    → "Nature" or "Environment"
  Seasonal / Holiday              → "Holidays & Celebrations"

If two categories are equally valid → choose the one with less competition
(this is the one with fewer Adobe Stock results for the primary keyword).
```

#### AI Disclosure and Other Fields

```
"created_with_ai": true          (always — all images come from Google Flow AI)
"people_are_fictional": true     (always — no real people in AI-generated images)
"property_is_fictional": true    (always — no real property in AI-generated images)
"file_type": "Photos"            (for photorealistic AI images — default for Flow output)
                                 Change to "Illustrations" only if the prompt explicitly
                                 requested illustrated/painterly style
"editorial_use_only": false      (default — commercial licenses earn more)
```

---

### Output: `.metadata.json` Sidecar File

```json
{
  "image_file": "ai_finance_16A_establishing_L1_001_20260323.png",
  "generated_at": "YYYY-MM-DDTHH:MM:SSZ",
  "series_slot": "16A_establishing",
  "aspect_ratio": "16:9",
  "trend_topic": "AI-Driven Financial Decision Making",
  "trend_category": "Technology × Finance",
  "loop_index": 1,

  "adobe_stock_metadata": {
    "title": "Diverse Team Analyzing AI Financial Data in Modern Office",
    "title_char_count": 57,
    "keywords": [
      "AI financial analysis",
      "diverse professionals technology workspace",
      "data-driven investment concept",
      "fintech team collaboration",
      "banking AI interface",
      "holographic data visualization",
      "modern office environment",
      "focused teamwork",
      "business analytics",
      "cool blue lighting cinematic",
      "professional diverse team",
      "technology finance intersection",
      "innovation",
      "artificial intelligence",
      "data visualization",
      "financial technology",
      "business strategy",
      "wide establishing shot",
      "cinematic color grading",
      "horizontal banner format",
      "financial services marketing",
      "tech company website hero",
      "banking advertising",
      "investment platform visual",
      "enterprise software campaign"
    ],
    "keyword_count": 25,
    "category": "Business",
    "file_type": "Photos",
    "created_with_ai": true,
    "people_are_fictional": true,
    "property_is_fictional": true,
    "editorial_use_only": false
  },

  "generation_context": {
    "prompt_used": "Wide shot of a modern trading floor transformed by AI...",
    "model_used": "Nano Banana 2",
    "commercial_use_cases": ["Fintech app advertising", "Banking website hero images"],
    "visual_keywords_from_trend": ["AI financial analysis", "algorithmic trading concept"]
  },

  "status": "ready_for_upload",
  "applied_to_adobe_stock": false
}
```

---

### Sidecar File Naming Convention

```
Image file:    [trend_topic]_[series_slot]_[loop_index]_[seq]_[date].png
Sidecar file:  [trend_topic]_[series_slot]_[loop_index]_[seq]_[date].metadata.json

Example pair:
  ai_finance_16A_establishing_L1_001_20260323.png
  ai_finance_16A_establishing_L1_001_20260323.metadata.json

Both files always travel together. 03_METADATA_OPTIMIZER.md loads the sidecar
by matching the base filename — no search, no guessing, always deterministic.
```

---

### Integration with 03_METADATA_OPTIMIZER.md

```
When 03_METADATA_OPTIMIZER.md processes each uploaded image on Adobe Stock:

  STEP 1: Match the uploaded image filename to its .metadata.json sidecar
  STEP 2: Load the pre-written metadata from the sidecar (instant, no analysis)
  STEP 3: Quick visual sanity check (5 seconds):
          → Does the uploaded image broadly match the series_slot description?
          → If 16A (establishing wide shot) → confirm it is a wide scene, not a portrait
          → If obvious drift detected → flag for manual metadata adjustment
          → If broadly correct → proceed to apply
  STEP 4: Apply all fields from adobe_stock_metadata to the Adobe Stock form
  STEP 5: Save (do NOT submit — user submits manually after review)
  STEP 6: Mark sidecar field "applied_to_adobe_stock": true

This makes 03_METADATA_OPTIMIZER.md a fast, reliable APPLIER — not a slow analyser.
The metadata quality is highest when written at creation time with full context.
```

---

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

#### D. Set Quantity to x1

```
QUANTITY BUTTONS (visible in settings panel):
- Row: [x1] [x2] [x3] [x4]
- Target: x1 (always — one image per description, each with a unique angle)
- If x1 is already selected → no action
- If set to any other quantity → click x1 button
- Verify: x1 has active/selected state

REASON: Each description in the series is specifically crafted for a unique
angle slot (establishing, close-up, overhead, variant). Generating x4 from
one description defeats this — all 4 would be random variations of the same
angle. x1 ensures each generation is intentional and purpose-built.
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

### 4.3 — IMAGE CREATION & DOWNLOAD CYCLE (Series-Based)

#### Overview — The Create→Download Loop

```
The fundamental unit of work is ONE SERIES = 8 images for ONE TREND.
Downloads happen in TWO BATCHES of 4 — first the 16:9 group, then the 1:1 group.
The series always follows these 6 steps in order, no exceptions:

  ┌────────────────────────────────────────────────────────────┐
  │  SERIES CYCLE (repeated for every trend, loops infinitely) │
  └────────────────────────────────────────────────────────────┘
         │
         ▼
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STEP 1 — GENERATE 16:9 GROUP
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Submit 4 images one by one (16:9 aspect ratio, x1 quantity):
  ├─ [16A] Enter establishing shot description → Set 16:9 + x1 → Generate → Wait 1s
  ├─ [16B] Enter close-up detail description  → Set 16:9 + x1 → Generate → Wait 1s
  ├─ [16C] Enter overhead description         → Set 16:9 + x1 → Generate → Wait 1s
  └─ [16D] Enter mood/variant description     → Set 16:9 + x1 → Generate → Wait 1s
         │
         ▼
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STEP 2 — WAIT FOR 16:9 RENDERS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Poll gallery every 10 seconds until all 4 × 16:9 thumbnails are fully rendered.
  Check each thumbnail's DOM text for "limit reached" error text.
  Max wait: 3 minutes → then proceed with however many rendered.
         │
         ▼
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STEP 3 — DOWNLOAD 16:9 GROUP
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Download all rendered 16:9 images (parallel upscaling, 1s gap between each):
  ├─ Right-click image 1 → 2K upscaled → Wait 1s → next
  ├─ Right-click image 2 → 2K upscaled → Wait 1s → next
  ├─ Right-click image 3 → 2K upscaled → Wait 1s → next
  └─ Right-click image 4 → 2K upscaled → Wait 1s
  All 4 upscale concurrently on server → files auto-download → Sub-Agent D writes sidecars
         │
         ▼
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STEP 4 — GENERATE 1:1 GROUP
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Submit 4 images one by one (1:1 aspect ratio, x1 quantity):
  ├─ [1A]  Enter portrait description         → Set 1:1 + x1 → Generate → Wait 1s
  ├─ [1B]  Enter extreme close-up description → Set 1:1 + x1 → Generate → Wait 1s
  ├─ [1C]  Enter flat-lay description         → Set 1:1 + x1 → Generate → Wait 1s
  └─ [1D]  Enter demographic variant desc.    → Set 1:1 + x1 → Generate → Wait 1s
         │
         ▼
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STEP 5 — WAIT FOR 1:1 RENDERS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Poll gallery every 10 seconds until all 4 × 1:1 thumbnails are fully rendered.
  Check each thumbnail's DOM text for "limit reached" error text.
  Max wait: 3 minutes → then proceed with however many rendered.
         │
         ▼
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  STEP 6 — DOWNLOAD 1:1 GROUP
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Download all rendered 1:1 images (parallel upscaling, 1s gap between each):
  ├─ Right-click image 1 → 2K upscaled → Wait 1s → next
  ├─ Right-click image 2 → 2K upscaled → Wait 1s → next
  ├─ Right-click image 3 → 2K upscaled → Wait 1s → next
  └─ Right-click image 4 → 2K upscaled → Wait 1s
  All 4 upscale concurrently on server → files auto-download → Sub-Agent D writes sidecars
         │
         ▼
  ✓ Series complete — move to NEXT TREND → start from STEP 1 again
  (Loop infinitely through all trends until rate limit or all accounts exhausted)
```

**Why download after every 4 images (not after all 8):**
- Faster feedback loop — if a rate limit hits during 1:1 generation, the 16:9 group is already downloaded
- Reduced risk of lost images — smaller batches mean fewer images at risk if something goes wrong
- Better resource management — server-side upscale jobs are spread across two waves instead of one large batch
- Account switches are cleaner — partial work is already saved before switching
- If only 1-3 images render before limit is reached, those are already downloaded

**Rate Limit Detection:**
- When the daily limit is reached, Google Flow does NOT always show an error modal
- Instead, it may render a thumbnail with error TEXT visible in its DOM content
- The agent checks each new thumbnail's textContent during STEP 2 and STEP 5 polling
- If error text is detected → immediately download whatever rendered → then switch model/account

---

#### STEP 1 — GENERATE 16:9 GROUP (4 Descriptions, One by One)

For each of the 4 × 16:9 descriptions in the current trend series:

```
ACTION 1: Clear and enter the description
- Click the prompt input to focus
- Select all (Ctrl+A) → Delete any existing text
- Type or paste the prompt text for the current series slot
  (e.g., for slot 16A: the establishing shot description)
- Verify: input contains the correct text

ACTION 2: Open settings panel
- Click the settings trigger button in the prompt toolbar
- Wait for settings panel DOM to appear

ACTION 3: Verify/set all three settings
  a. OUTPUT TYPE: Verify Image tab is selected. If not → click Image tab.
  b. ASPECT RATIO: Click "16:9" button → verify it is selected
  c. QUANTITY: Click "x1" button → verify it is selected
  d. MODEL: Verify correct model shown (Nano Banana 2 or current priority model)
     If wrong → click model selector → choose correct model → wait for dropdown close
- Close settings panel

ACTION 4: Click Generate (Arrow button)
- Click the generate/send button
- Verify: generation job started (progress indicator appears in gallery)
- Wait 1 second (UI registration pause)
- DO NOT wait for image to finish rendering

ACTION 5: Move to next slot in 16:9 group
- Increment slot index: 16A → 16B → 16C → 16D
- Repeat Actions 1–4 for the next description
- After 16D is submitted → proceed to STEP 2 (wait for 16:9 renders)
```

**Settings efficiency note:**
```
After the first generation in a series, settings only need to change if:
- Aspect ratio changes (16:9 → 1:1 only at the STEP 3 → STEP 4 boundary)
- Model changes (on rate limit event only)
- Quantity somehow got reset (verify only, not change)

Within STEP 1: aspect ratio stays 16:9, quantity stays x1, model stays the same.
Open settings only to verify or change — do NOT open unnecessarily.
Between 16B and 16C (same ratio, same quantity): only update the description text,
then click generate. Settings only need to re-open if something needs to change.
```

---

#### STEP 2 — WAIT FOR 16:9 RENDERS

```
After all 4 × 16:9 generation jobs are submitted (after STEP 1):

POLL STRATEGY:
- Poll the project gallery every 10 seconds
- For each of the 4 generation jobs tracked in session_state:
  check if a rendered thumbnail (non-spinning) has appeared
- Count how many of the 4 are fully rendered
- Continue polling until ONE of these three things happens:
  a. All 4 thumbnails are fully rendered → proceed to STEP 3 (download 16:9 group)
  b. A "limit reached" error is detected on any thumbnail → TRIGGER PARTIAL DOWNLOAD
  c. 3 minutes have elapsed → proceed to STEP 3 with however many rendered so far

LIMIT REACHED DETECTION ON RENDERED THUMBNAILS:
- After each poll, check each new thumbnail container's DOM text content
- If textContent of thumbnail container matches error patterns:
  → Thumbnail is a limit-reached error state, NOT a real image
  → Do NOT attempt to download it
  → Signs: no valid <img> src, text content present, possible error CSS class
- If detected:
  → STOP polling immediately
  → LOG: "Limit reached detected on rendered thumbnail (DOM text). Triggering partial download."
  → Proceed to STEP 3 with any successfully rendered real images only
  → After STEP 3 download completes → trigger model/account switch

TRACKING:
- session_state.current_16x9_submitted = [list of 4 generation job IDs or positions]
- session_state.current_16x9_rendered = [list of rendered thumbnails]
- Match rendered thumbnails to submitted jobs by position in gallery (newest first)

TIMEOUT BEHAVIOR:
- If after 3 minutes fewer than 4 images have rendered:
  → Proceed to STEP 3 and download whatever has rendered
  → Log: "Timeout: [N] of 4 16:9 images rendered for trend [topic]. Downloading [N]."
  → Mark unrendered slots as "generation_failed" in session_state
  → After STEP 3 download → proceed to STEP 4 (generate 1:1 group)
```

---

#### STEP 3 — DOWNLOAD 16:9 GROUP (Parallel Upscaling)

```
After STEP 2 confirms which 16:9 images are ready:

FOR EACH rendered 16:9 image (right-click method):

  ACTION 1: Hover over the image thumbnail → wait 500ms for hover menu DOM
  ACTION 2: Right-click the image → wait for context menu modal
  ACTION 3: Hover over "Download" → wait 300ms for sub-menu
  ACTION 4: Click "2K upscaled"
  ACTION 5: Wait 1 second (UI registration)
  ACTION 6: Mark image as "upscale_requested" in session_state
  ACTION 7: Move to the NEXT image immediately — do NOT wait for upscale to finish

All 4 upscale jobs run in parallel on Google's servers.
Files auto-download to system downloads folder as each completes.

BACKGROUND FILE WATCHER (runs continuously during session):
  → Monitors the system downloads folder
  → When a new file appears:
      a. Rename using structured convention:
         [trend_topic]_[series_slot]_[loop_index]_[timestamp].png
         Example: ai_finance_16A_establishing_L1_001_20260323.png
      b. Move to: C:\AdobeStockAutomation\downloads\[session_date]\
      c. Sub-Agent D fires → writes ai_finance_16A_establishing_L1_001_20260323.metadata.json
      d. Update session_state.downloaded_images list
      e. Increment images_downloaded_count
      f. Log: "Downloaded + metadata written: [filename]"

STEP 3 COMPLETE SIGNAL:
  → All rendered 16:9 images confirmed in downloaded_images list
  → OR: 60 seconds have passed since last upscale request with no more pending
  → Log: "16:9 group for [trend_topic] complete. [N] images downloaded."
  → Proceed to STEP 4 (generate 1:1 group)
```

---

#### STEP 4 — GENERATE 1:1 GROUP (4 Descriptions, One by One)

```
Same process as STEP 1, but aspect ratio switches to 1:1 at the very start.

FIRST IMAGE ONLY — open settings to switch aspect ratio:
  → Open settings panel
  → Change aspect ratio from 16:9 to 1:1
  → Verify x1 quantity still selected (no change needed if still x1)
  → Verify model still correct (no change needed)
  → Close settings panel

IMAGES 2, 3, 4 — skip opening settings:
  → Ratio is already 1:1 from the previous step
  → Only open settings again if the model changes (rate limit event)

For each of the 4 × 1:1 descriptions (1A → 1B → 1C → 1D):

  → Clear prompt input
  → Enter the slot-specific description
  → Click Generate
  → Wait 1 second
  → Move to next slot

After slot 1D is submitted → proceed to STEP 5 (wait for 1:1 renders)
```

---

#### STEP 5 — WAIT FOR 1:1 RENDERS

```
Same logic as STEP 2, but tracking 1:1 images instead of 16:9:

After all 4 × 1:1 generation jobs are submitted (after STEP 4):

POLL STRATEGY:
- Poll the project gallery every 10 seconds
- Check each new thumbnail for renders (non-spinning) and error states (DOM text)
- Continue polling until ONE of these three things happens:
  a. All 4 thumbnails are fully rendered → proceed to STEP 6 (download 1:1 group)
  b. A "limit reached" error is detected on any thumbnail → TRIGGER PARTIAL DOWNLOAD
  c. 3 minutes have elapsed → proceed to STEP 6 with however many rendered so far

LIMIT REACHED HANDLING:
- If "limit reached" DOM text detected on any 1:1 thumbnail:
  → STOP polling immediately
  → Proceed to STEP 6 with any successfully rendered 1:1 images only
  → After STEP 6 download completes → trigger model/account switch
  → Resume from the failed slot with the new account/model

TRACKING:
- session_state.current_1x1_submitted = [list of 4 generation job IDs or positions]
- session_state.current_1x1_rendered = [list of rendered thumbnails]
```

---

#### STEP 6 — DOWNLOAD 1:1 GROUP (Parallel Upscaling)

```
Same process as STEP 3, but for 1:1 images:

FOR EACH rendered 1:1 image (right-click method):

  ACTION 1: Hover over the image thumbnail → wait 500ms for hover menu DOM
  ACTION 2: Right-click the image → wait for context menu modal
  ACTION 3: Hover over "Download" → wait 300ms for sub-menu
  ACTION 4: Click "2K upscaled"
  ACTION 5: Wait 1 second (UI registration)
  ACTION 6: Mark image as "upscale_requested" in session_state
  ACTION 7: Move to the NEXT image immediately

Background file watcher renames, moves, and triggers Sub-Agent D per downloaded file.

STEP 6 COMPLETE SIGNAL:
  → All rendered 1:1 images confirmed in downloaded_images list
  → OR: 60 seconds have passed since last upscale request with no more pending
  → Log: "1:1 group for [trend_topic] complete. [N] images downloaded."
  → Log: "Series [trend_topic] fully complete. [N] total images downloaded."
  → Proceed to next trend → begin that trend's STEP 1
```

---

#### Rate Limit During Generation — Download First, Then Switch

```
IF a rate limit error is detected at ANY point during STEP 1 or STEP 4:

  ACTION 1: STOP submitting new generation jobs immediately
  ACTION 2: LOG: "Rate limit hit after [N] of 4 images submitted for [16:9 or 1:1] group."

  ACTION 3: WAIT for any already-submitted jobs to finish rendering
          → Poll gallery for up to 3 minutes for pending renders
          → Collect all rendered thumbnails
          → CHECK each thumbnail DOM text for "limit reached" error
          → Exclude any limit-reached thumbnails from download

  ACTION 4: DOWNLOAD all successfully rendered images
          → Run STEP 3 (if limit hit during STEP 1) or STEP 6 (if hit during STEP 4)
          → DO NOT skip this step — download everything before switching
          → Even if only 1, 2, or 3 images rendered → download those

  ACTION 5: Update session_state:
          → Mark which slots were submitted (status: "batches_sent")
          → Mark which slots are missing (status: "pending" — retry in next loop)
          → Record partial_series_downloaded = true

  ACTION 6: Determine rate limit type and switch:
          → If Nano Banana 2 exhausted → switch to Nano Banana Pro → resume
          → If both models exhausted → switch account → reset model to Nano Banana 2
          → If all accounts exhausted → proceed to session complete

  ACTION 7: After switching — resume from the NEXT incomplete slot
          → The partially completed series will be retried in the next loop pass

PARTIAL DOWNLOAD HANDLING (1–3 images before limit):
─────────────────────────────────────────────────────
If only 1, 2, or 3 images were successfully rendered before the limit was reached:

  → DOWNLOAD those images immediately
  → LOG: "Partial download: [N] images saved before limit reached."
  → UPDATE session_state with downloaded image IDs
  → Sub-Agent D writes metadata sidecars for downloaded images
  → THEN trigger model/account switch
  → RESUME generation from the first uncompleted slot after switch

Example scenario:
  - STEP 1: Submitted 16A, 16B, 16C successfully
  - STEP 1: 16D generation returns "limit reached" thumbnail (DOM text detected)
  - ACTION: Wait for 16A, 16B, 16C to render → run STEP 3 to download them
  - ACTION: Switch model/account
  - RESUME: Re-enter STEP 1 starting from 16D with new account, then continue to STEP 4
```

---

#### Critical Timing Rules

```
Generation (STEP 1 and STEP 4):
  → 1 second wait after each Generate click (UI registration)
  → No other waiting between generations within the same step
  → Settings panel only opened when something needs to change

Download (STEP 3 and STEP 6):
  → 1 second wait after each 2K upscaled click (UI registration)
  → Never wait for one upscale to finish before clicking the next
  → All upscales run in parallel on the server

Between series:
  → No fixed delay — proceed to next trend's STEP 1 as soon as STEP 6 download
    requests are all submitted (background watcher handles file arrival)
  → The 1s gaps between download clicks effectively pace the transition
```

---

### 4.4 — RATE LIMIT DETECTION & MODEL SWITCHING

#### Detecting Rate Limit Errors

Rate limits can be detected in TWO different ways:

**Method 1: During Generation (Modal/Toast Errors)**

During or after clicking Generate, monitor for any of these signals:

```
Rate Limit Signals to Detect (Modal/Toast):
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

**Method 2: On Rendered Image (Text Overlay in DOM) — PRIMARY METHOD**

When the daily limit is reached, Google Flow often does NOT show an error modal. Instead, it renders the thumbnail slot with a text-based error state. This text is present in the DOM — it does not need to be read from pixel data via OCR.

```
Rate Limit Signals to Detect (On Rendered Thumbnail):
1. The thumbnail container element renders with visible TEXT content instead of an image
2. Text patterns to search for inside the thumbnail DOM node and its children:
   - "limit reached"
   - "daily limit"
   - "quota exceeded"
   - "generations limited"
   - "try again later"
   - "out of credits"
   - Any text that does not describe the image subject
3. Visual indicators (observable in DOM):
   - The <img> element inside the thumbnail is absent or has a placeholder src
   - A text or error element is the primary visible child of the thumbnail container
   - The thumbnail container has an error CSS class or data attribute

Detection Implementation:
- After each gallery poll, for every new thumbnail that appeared:
  a. Read the text content of the thumbnail container element and all its children:
     thumbnailEl.innerText OR thumbnailEl.textContent
  b. If the text content matches any error pattern above → LIMIT_REACHED = true
  c. If the thumbnail has a valid <img> with a non-placeholder src → it is a real image
- This is pure DOM inspection — no OCR, no image processing required
- React renders error states as DOM text nodes, same as any other content

IMPORTANT: Do NOT attempt pixel-level OCR on the thumbnail image data.
The error state is always in the DOM as text — reading textContent is instant and reliable.
```

**Detection Code Logic:**

```
After clicking Generate OR during gallery poll:
- Wait for render to complete (thumbnail container appears in DOM)
- Check Method 2 first (DOM text inspection — fast):
  a. Get the thumbnail container element
  b. Read its textContent or innerText
  c. If text matches error patterns → LIMIT_REACHED = true → trigger handler
- If no DOM text found → check Method 1 (modal/toast scan):
  a. Scan page DOM for modal or toast elements containing error text patterns
  b. If found → LIMIT_REACHED = true → trigger handler
- If neither → thumbnail is a valid image → continue normally
```

#### Model Switching Logic

```
IF RATE_LIMIT_DETECTED (via modal/toast) OR LIMIT_REACHED_ON_IMAGE (via thumbnail text):

  CASE 1: Current model is "Nano Banana 2"
  ─────────────────────────────────────────
  → Set session_state.current_account.nano_banana_2_exhausted = true
  → Switch model to "Nano Banana Pro"
  → Update session_state.current_model = "Nano Banana Pro"
  → IF images rendered successfully before limit:
      → Download those images first (run STEP 3 if limit hit during STEP 1,
        or run STEP 6 if limit hit during STEP 4)
  → Retry the SAME generation that failed (re-send current description + aspect ratio)
  → Log: "Switched from Nano Banana 2 to Nano Banana Pro for account [email]"
  → Continue generation loop with Nano Banana Pro

  CASE 2: Current model is "Nano Banana Pro" (both models exhausted)
  ─────────────────────────────────────────────────────────────────
  → Set session_state.current_account.nano_banana_pro_exhausted = true
  → Set session_state.current_account.fully_exhausted = true
  → IF images rendered successfully before limit:
      → Download those images first
  → Log: "Account [email] fully exhausted. Switching to next account."
  → TRIGGER ACCOUNT SWITCHING PROCEDURE (see Section 4.5)

  CASE 3: All accounts fully exhausted
  ─────────────────────────────────────
  → Log: "ALL ACCOUNTS EXHAUSTED. No more generation possible today."
  → Proceed to download any remaining rendered images
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
    "quantity_x1": {
      "description": "x1 quantity button — generates 1 image per prompt (current default for series-based generation)",
      "trigger_required": true,
      "trigger_action": "open settings panel",
      "selector": "[DISCOVERED_AFTER_TRIGGER]",
      "fallback_text_match": "x1",
      "interaction": "click to select"
    },
    "quantity_x4": {
      "description": "x4 quantity button — kept in registry for reference; NOT used in series mode",
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

> The download phase is now fully integrated into the series creation cycle in **Section 4.3 — STEP 3 and STEP 6**. Downloads happen immediately after each 4-image group renders — not at the end of the session.

#### Download Behavior Summary

```
WHEN:
  - STEP 3: Download 16:9 group, runs after STEP 2 (wait for 16:9 renders)
  - STEP 6: Download 1:1 group, runs after STEP 5 (wait for 1:1 renders)
HOW:  Right-click each image → 2K upscaled → Wait 1s → next image
      All upscale jobs run in parallel on server
      Files auto-download as each completes
      Background watcher renames + moves files to output folder
      Sub-Agent D writes .metadata.json sidecar per confirmed download

RATE LIMIT INTERRUPT:
  If limit hits mid-group (during STEP 1 or STEP 4):
  → Wait for pending renders → check for "limit reached" DOM text
  → Download only successfully rendered images (even if just 1–3)
  → THEN switch model/account → never skip the download step

PARTIAL DOWNLOAD HANDLING:
  If only 1–3 images rendered before "limit reached" detected:
  → Download those images immediately
  → Log: "Partial download: [N] images saved before limit."
  → Update session_state with downloaded image IDs
  → Then trigger model/account switch
  → Resume from first uncompleted slot after switch

SESSION END CLEANUP:
  After the infinite loop stops (all accounts exhausted):
  → Scan gallery one final time for any missed undownloaded images
  → Submit 2K upscale for any found → wait for downloads
  → Once gallery has no new undownloaded images → session complete
```

#### Download Verification

```
Per-group verification (after STEP 3 and after STEP 6):
- Compare session_state.current_group_rendered vs current_group_downloaded
- If any gap → log + retry download for missed images
- Log: "[16:9/1:1] group for [topic] downloaded: [N]/4 images."

Session-end verification:
- Final gallery scan confirms no undownloaded images remain
- Log: "Session complete. [N] total images downloaded. [N] series completed."
- Write final counts to session_state.json and automation_log.txt
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
For each trend → generate 8 angle-specific descriptions:
  16:9: [16A establishing] [16B close-up] [16C overhead] [16D mood variant]
  1:1:  [1A portrait] [1B extreme close-up] [1C flat-lay] [1D demographic variant]
     │
     ▼
Output: descriptions.json (8 per trend, no fixed total)
     │
     ▼
SUB-AGENT C: Image Creation & Download Agent
───────────────────────────────────────────
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
  → Ensure x1 quantity is selected
  → Ensure correct model is selected (Nano Banana 2 by default)
  → Close settings panel
     │
     ▼
╔══════════════════════════════════════════════════════════════════╗
║  INFINITE SERIES LOOP (create→download per trend, no end count)  ║
║  Downloads in TWO BATCHES of 4 images each                       ║
║  Sub-Agent D writes metadata sidecar after each confirmed DL     ║
║  Runs until ALL accounts + ALL models are exhausted              ║
╚══════════════════════════════════════════════════════════════════╝
     │
     ▼
loop_index = 0
current_trend_index = 0
     │
     ▼
FOR EACH trend (cycling — restarts from 0 when all trends done):
  │
  ├─ STEP 1 — Generate 16:9 group (4 descriptions, one by one, x1 each):
  │   [16A] Enter establishing shot desc → 16:9 + x1 → Generate → Wait 1s
  │   [16B] Enter close-up detail desc   → 16:9 + x1 → Generate → Wait 1s
  │   [16C] Enter overhead desc          → 16:9 + x1 → Generate → Wait 1s
  │   [16D] Enter mood/variant desc      → 16:9 + x1 → Generate → Wait 1s
  │
  ├─ STEP 2 — Wait for 16:9 renders:
  │   Poll every 10s, max 3 min
  │   Check thumbnail DOM text for "limit reached" → if found, trigger partial download
  │
  ├─ STEP 3 — Download 16:9 group (parallel upscaling, 1s gap):
  │   Right-click each of 4 images → 2K upscaled → Wait 1s → next
  │   Background watcher renames + moves files as they auto-download
  │   └─ Sub-Agent D fires per confirmed download: writes .metadata.json sidecar
  │
  ├─ STEP 4 — Generate 1:1 group (4 descriptions, one by one, x1 each):
  │   [1A]  Enter portrait desc          → 1:1 + x1 → Generate → Wait 1s
  │   [1B]  Enter extreme close-up desc  → 1:1 + x1 → Generate → Wait 1s
  │   [1C]  Enter flat-lay desc          → 1:1 + x1 → Generate → Wait 1s
  │   [1D]  Enter demographic variant    → 1:1 + x1 → Generate → Wait 1s
  │
  ├─ STEP 5 — Wait for 1:1 renders:
  │   Poll every 10s, max 3 min
  │   Check thumbnail DOM text for "limit reached" → if found, trigger partial download
  │
  ├─ STEP 6 — Download 1:1 group (parallel upscaling, 1s gap):
  │   Right-click each of 4 images → 2K upscaled → Wait 1s → next
  │   Background watcher renames + moves files as they auto-download
  │   └─ Sub-Agent D fires per confirmed download: writes .metadata.json sidecar
  │
  └─ Series complete → next trend (loop back to first trend when all done)
             │
             ▼
             More trends? → YES → next trend's STEP 1
                          → NO  → loop_index++
                                   LOG: "Loop [N] complete. Restarting."
                                   Reset trend_index to 0
                                   Restart from first trend's STEP 1
     │
     ▼ (triggered at any point during the generation loop)
RATE LIMIT HANDLER:
────────────────────
Detection Methods:
  1. Modal/toast error message
  2. "Limit reached" TEXT rendered on image thumbnail ← PRIMARY METHOD

If limit detected during STEP 1 (16:9 generation) or STEP 4 (1:1 generation):
  → STOP submitting new generations
  → WAIT for pending renders (max 3 min)
  → CHECK thumbnails DOM text for "limit reached"
  → DOWNLOAD any successfully rendered images:
     If during STEP 1 → run STEP 3 (download what rendered from 16:9 group)
     If during STEP 4 → run STEP 6 (download what rendered from 1:1 group)
  → THEN switch model/account

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
| Generation job silent failure    | No new images after 3 min           | Re-submit description            |
| Download failure                 | File not in downloads after 60s     | Retry download from gallery      |
| Login session expired            | Redirected to login page            | Re-login with current account    |
| Network timeout                  | Request timeout exception           | Wait 10s, retry 3×               |
| Rate limit false positive        | Error shown but generation proceeds | Log warning, continue monitoring |
| Metadata sidecar write failure   | .metadata.json not created after DL | Retry write using cached context; log if still fails |


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
│       ├── ai_finance_16A_establishing_L1_001_20260323.png
│       ├── ai_finance_16A_establishing_L1_001_20260323.metadata.json  ← Sub-Agent D
│       ├── ai_finance_16B_close_up_L1_002_20260323.png
│       ├── ai_finance_16B_close_up_L1_002_20260323.metadata.json      ← Sub-Agent D
│       ├── ai_finance_16C_overhead_L1_003_20260323.png
│       ├── ai_finance_16C_overhead_L1_003_20260323.metadata.json      ← Sub-Agent D
│       ├── ai_finance_16D_mood_variant_L1_004_20260323.png
│       ├── ai_finance_16D_mood_variant_L1_004_20260323.metadata.json  ← Sub-Agent D
│       ├── ai_finance_1A_portrait_L1_005_20260323.png
│       ├── ai_finance_1A_portrait_L1_005_20260323.metadata.json       ← Sub-Agent D
│       └── ...  (no fixed count — grows until all credits exhausted)
│       (every image always paired with its .metadata.json sidecar)
│
├── data\
│   ├── STOCK_SUCCESS_REPORT.md          ← READ FIRST on every session (Step 0)
│   ├── session_state.json               ← updated continuously during session
│   ├── trend_data.json                  ← regenerated every session
│   ├── descriptions.json                ← regenerated every session (8 per trend)
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
    "images_per_generation_batch": 1,
    "descriptions_per_trend": 8,
    "series_slots_16_9": ["16A_establishing", "16B_close_up", "16C_overhead", "16D_mood_variant"],
    "series_slots_1_1": ["1A_portrait", "1B_extreme_close_up", "1C_flatlay", "1D_demographic_variant"],
    "generation_loop": "infinite — create→download in 4-image batches, runs until all credits exhausted",
    "download_batch_size": 4,
    "upscaling_mode": "parallel — submit all 4 with 1s gap between each",
    "generation_wait_between_clicks_ms": 1000,
    "download_wait_between_clicks_ms": 1000,
    "series_render_poll_interval_seconds": 10,
    "series_render_timeout_minutes": 3,
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
    "metadata_sidecars_written": "[same count as images — always paired]",
    "loop_passes_completed": "[N]",
    "trend_topics_used": ["AI Finance", "Climate Tech", "..."],
    "descriptions_reference": "C:\\AdobeStockAutomation\\data\\descriptions.json",
    "sidecar_naming_convention": "[image_basename].metadata.json"
  }
}
```

`02_IMAGE_UPSCALER.md` reads this handoff block to know which folder to process. Every `.png` in the folder has a paired `.metadata.json` sidecar that travels with it through upscaling. `03_METADATA_OPTIMIZER.md` reads these sidecars to apply pre-written metadata to each uploaded image on Adobe Stock — no reverse-engineering from pixels required.

---

*FILE 01 END — TREND RESEARCH & IMAGE CREATION AUTOMATION*
*Next: 02_IMAGE_UPSCALER.md → 03_METADATA_OPTIMIZER.md*