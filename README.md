# minimi Hiring Challenge --- Temporal Chat Agent

A production-grade, submission-ready conversational agent built in TypeScript for the **minimi hiring challenge**.

The agent features persistent conversational memory, explicit temporal reasoning across configurable timezones, and verified like-for-like factual comparison backed by **exactly one external model tool: `web_search`**.

---

## Key Features

1. **Natural Conversational Interaction**: Answers general questions naturally and transparently handles uncertainty.
2. **Persistent SQLite Memory**: Retains conversation history, messages, memory items, recognized entities, search snapshots, and factual observations across server restarts using standard Node.js built-in `node:sqlite`.
3. **Temporal Reasoning**: Interprets relative and explicit dates (`yesterday`, `last Tuesday`, `on 3 November`, `earlier this week`, `since Monday`) against UTC message timestamps and a configurable IANA timezone (`Asia/Kolkata` by default). Plausible ambiguities automatically prompt clarification questions.
4. **Hybrid Memory Retrieval**: Combines structured SQL date/entity filtering with SQLite FTS5 full-text indexing, prioritizing explicit date boundaries over fuzzy lexical matches.
5. **Single External Tool (`web_search`)**: Only `web_search` is exposed to the LLM. Database queries, memory retrievals, and entity lookups are strictly internal application services.
6. **Live Multi-Provider Support**:
   - **LLM Providers**: Groq (`qwen/qwen3.8-27b`), xAI Grok, OpenAI (`gpt-4o-mini`), Google Gemini, or built-in deterministic offline mock mode.
   - **Search Providers**: Tavily Search, Brave Search, SerpAPI, or built-in deterministic offline mock mode.
7. **Like-for-Like Evidence Comparison**: Compares historical baselines with current primary sources matching currency, billing period, seat counts, and plan tiers. Classifies results into:
   - `changed`
   - `unchanged based on checked evidence`
   - `inconclusive`
   - `not found`
8. **No Fabricated Data & Prompt Injection Defense**: If a historical baseline is absent, it clearly explains the absence rather than inventing one. Sanitizes untrusted web snippets to neutralize injected commands.

---

## Architectural Overview

```
                      ┌───────────────────────────────────────┐
                      │          React + Vite UI              │
                      │  (Chat, Live Badges, Citations, Web)  │
                      └──────────────────┬────────────────────┘
                                         │ HTTP REST
                      ┌──────────────────▼────────────────────┐
                      │          Fastify API Server           │
                      │      (/api/chat, /api/health)         │
                      └──────────────────┬────────────────────┘
                                         │
                      ┌──────────────────▼────────────────────┐
                      │        Agent Orchestrator             │
                      │  Bounded Loop (Max 3 rounds, no dups) │
                      └───────┬──────────────┬─────────────┬──┘
                              │              │             │
              ┌───────────────▼─┐    ┌───────▼───────┐   ┌─▼──────────────────┐
              │  Temporal Engine│    │ Memory Engine │   │   Evidence Engine  │
              │  (Luxon, IANA)  │    │  (SQL + FTS5) │   │ (Like-for-like cmp)│
              └─────────────────┘    └───────┬───────┘   └────────────────────┘
                                             │
                       ┌─────────────────────▼─────────────────────┐
                       │          Built-in SQLite Persistence      │
                       │ (WAL Mode, FTS5 virtual tables, triggers) │
                       └───────────────────────────────────────────┘
```

---

## Quickstart & Setup

### 1. Requirements
- Node.js `v22+` or `v24+` (with native built-in `node:sqlite`)
- npm `v10+`

### 2. Installation
Clone the repository and install all dependencies:
```bash
npm install
```

### 3. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Review environment keys in `.env`:
```ini
PORT=3001
HOST=0.0.0.0
TIMEZONE=Asia/Kolkata
DATABASE_URL=./data/minimi.db
LOG_LEVEL=info

# LLM Provider Configuration (options: groq | grok | openai | gemini | mock)
# Default live provider when GROQ_API_KEY is configured:
LLM_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=qwen/qwen3.8-27b

# Search Provider Configuration (options: tavily | brave | serpapi | mock)
# Default live search provider when TAVILY_API_KEY is configured:
SEARCH_PROVIDER=tavily
TAVILY_API_KEY=your_tavily_api_key_here
```

> **Offline Mode**: If neither API key is set (or `LLM_PROVIDER=mock` and `SEARCH_PROVIDER=mock`), the application runs 100% offline with deterministic mock providers.

### 4. Seed Historical Conversations
Preload historical test conversations (Monday CRM shortlist, Nov 3 Neon Postgres inquiry, Tuesday Supabase discussion):
```bash
npm run seed
```

### 5. Start Development Server
Run the frontend (Vite) and backend (Fastify) concurrently with a single command:
```bash
npm run dev
```
Open **`http://localhost:5173`** in your browser. Live provider badges in the header and sidebar will clearly show whether LLM and Search are in `Live` or `Mock` mode.
```bash
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## Challenge Evaluation Cases

The app is preconfigured to handle the 3 minimi hiring challenge scenarios:

1. **CRM Shortlist Comparison**:
   > *"On Monday we shortlisted 5 CRM tools for a 20-person sales team. Has any of them changed pricing or shipped something big since?"*
   - Recovers Monday shortlist (HubSpot, Salesforce, Pipedrive, Zoho, Copper).
   - Searches live web for current pricing.
   - Compares like-for-like values and cites official sources.

2. **Historical Recall + Freshness Verification**:
   > *"What did I ask you on 3 November? Is your answer still correct today?"*
   - Resolves `3 November` against configured `Asia/Kolkata` timezone.
   - Recovers the Neon serverless Postgres discussion.
   - Searches current documentation for verification.

3. **Relative-Date Hosting Comparison**:
   > *"Last Tuesday I asked you about Postgres hosting. Has any pricing changed since then?"*
   - Resolves `last Tuesday` relative to the current timestamp.
   - Recovers Supabase discussion and compares verified pricing.

4. **Missing Historical Baseline**:
   > *"Is the pricing for Snowflake warehouse hosting still what we agreed on last month?"*
   - Clearly reports that no historical baseline exists in conversation history rather than fabricating one.

---

## Testing & Benchmarks

Run the full automated test suite (80 deterministic tests across 8 test suites covering temporal resolution, memory retrieval, like-for-like comparator, prompt injection defense, Groq, xAI Grok, Tavily, and live audit scenarios):
```bash
npm test
```

### Evaluation Benchmark Suite
Run the 20-case evaluation benchmark:
```bash
npm run eval
```

**Measured Results:**
- **Total Test Cases**: 20
- **Pass Rate**: 100% (20 / 20)
- **Tool-Call Accuracy**: 100%
- **Citation Validity Rate**: 100%
- **Average Latency**: ~10–13 ms (deterministic offline mode)

---

## Project Structure

```
├── package.json              # Monorepo workspaces config & scripts
├── tsconfig.json             # Root TypeScript config
├── DESIGN.md                 # Design document and architecture spec
├── README.md                 # Setup, documentation, and usage
├── .env.example              # Environment variables template
├── .gitignore                # Ignored files (node_modules, db, dist, env)
├── server/
│   ├── src/
│   │   ├── config.ts         # Zod-validated environment config
│   │   ├── index.ts          # Server entry point
│   │   ├── app.ts            # Fastify application setup
│   │   ├── db/               # SQLite client, schema, triggers, seed
│   │   ├── temporal/         # Timezone & relative date parser
│   │   ├── memory/           # Hybrid SQL + FTS5 memory retrieval
│   │   ├── providers/        # LLM (OpenAI, Gemini, Mock) & Search (Tavily, Brave, Mock)
│   │   ├── agent/            # Bounded Orchestrator, web_search tool, prompts
│   │   ├── evidence/         # Like-for-like factual comparator & sanitizer
│   │   ├── routes/           # Fastify routes: /api/health, /api/conversations, /api/chat
│   │   └── eval/             # 20-case evaluation benchmark dataset & runner
│   └── tests/                # Vitest test suite
└── client/
    ├── index.html            # Vite HTML shell
    ├── src/
    │   ├── main.tsx          # React root
    │   ├── App.tsx           # Main application view & state
    │   ├── index.css         # Modern responsive CSS styling
    │   ├── api/client.ts     # Client HTTP service
    │   └── components/       # Sidebar, ChatWindow, MessageBubble
    └── vite.config.ts        # Vite build & proxy configuration
```

---

## Engineering Decisions & Trade-Offs

- **Built-in Node.js SQLite (`node:sqlite`)**: Uses Node's standard built-in SQLite engine with native FTS5 support. Eliminates C++ compiler/node-gyp issues across platforms while providing high performance, WAL journaling, and instant schema initialization.
- **Single Model Tool**: Only `web_search` is exposed to the model. Memory search is managed internally before model execution to eliminate hallucinatory model tool loops and preserve strict provenance.
- **Bounded Orchestration**: Tool calls are bounded to a maximum of 3 rounds with in-turn query deduplication to prevent runaway execution.
- **Strict Provenance**: Memory items and factual observations retain UTC creation timestamps, source URLs, retrieval dates, and entity links.
