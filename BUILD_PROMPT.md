# Build Prompt --- minimi Hiring Challenge Chat Agent

You are the lead engineer implementing the minimi hiring challenge.
Build a complete, working, submission-ready project in the current
repository. **Read `DESIGN.md` first and treat it as the source of
truth.** Do not silently change its architecture. If a detail is
genuinely underspecified, choose the smallest defensible implementation,
document the decision, and continue.

## Mission

Build a chat agent with exactly one external tool exposed to the LLM:
`web_search`. It must: 1. Answer ordinary conversational questions
naturally. 2. Remember what the user asked and when. 3. Retrieve
relevant past conversations using exact dates, relative dates, entities,
and paraphrases. 4. For "is this still correct?" or "what changed?"
questions, recover the historical baseline, search the web for current
evidence, compare like-for-like facts, and explain the result with
citations. 5. Be fast, reliable, transparent about uncertainty, and easy
to understand from the code and `DESIGN.md`.

The evaluation will include questions such as: - "On Monday we
shortlisted 5 CRM tools for a 20-person sales team. Has any of them
changed pricing or shipped something big since?" - "What did I ask you
on 3 November? Is your answer still correct today?" - "Last Tuesday I
asked you about Postgres hosting. Has any pricing changed since then?"

Do not hardcode these examples or their answers. Build general
capabilities.

## Non-negotiable constraints

-   JavaScript or TypeScript on Node.js.
-   The project must run with `npm install` followed by `npm run dev`.
-   Include every required key in `.env.example`; never commit real
    secrets.
-   Include `DESIGN.md` in the repository and keep it concise
    (approximately one page).
-   Exactly one external model tool: `web_search`. Database and memory
    access are internal application services, not model tools.
-   No fabricated memories, historical values, source URLs, publication
    dates, or change claims.
-   Keep the implementation understandable. You must be able to explain
    every important design decision.
-   Do not introduce unrelated features, unnecessary infrastructure, or
    a heavyweight agent framework.
-   Do not stop after generating a plan or scaffold. Implement, run,
    test, fix, and document the working application.

## Required workflow

Work autonomously in small verified milestones. First inspect the
repository and existing files. Preserve useful existing work; do not
overwrite or restructure it without reason. Then:

### Milestone 1 --- Repository and runnable foundation

-   Create a clean TypeScript Node project.
-   Use React + Vite for the frontend, Fastify for the API, SQLite for
    persistence, Drizzle for schema/migrations, Zod for validation, and
    Vitest for tests.
-   Configure a root `npm run dev` that starts the frontend and backend
    together.
-   Add `.env.example`, `.gitignore`, README setup instructions, health
    endpoint, database initialization, and a minimal usable chat screen.
-   Ensure the app starts successfully with the required commands.

### Milestone 2 --- Persistence and message history

Implement SQLite persistence for at least: - conversations - messages
(role, content, created_at UTC) - memory_items (content, type,
timestamps, optional entity references) - entities and message/entity
links - search_snapshots and search_results - fact_observations with
source reference and temporal metadata

Use migrations or deterministic schema initialization. Preserve original
messages. Historical observations must be append-only.

### Milestone 3 --- Hybrid memory retrieval

Implement: - Structured SQL retrieval by conversation, exact date range,
and entity. - SQLite FTS5 lexical retrieval. - Optional semantic
retrieval through a provider interface. - A graceful lexical/structured
fallback if embeddings are not configured or unavailable. - Merge,
deduplicate, and rank results; retain message IDs, timestamps, and
provenance. - Persist useful conversation summaries/entities without
replacing original messages.

Do not let a semantic match override an explicit date filter. Avoid
adding a separate vector database.

### Milestone 4 --- Temporal interpretation

-   Use an explicit configurable IANA timezone, default `Asia/Kolkata`.
-   Store timestamps as UTC instants.
-   Resolve "yesterday", "last Tuesday", "on 3 November", "earlier this
    week", and "since Monday" relative to the current message timestamp
    and configured timezone.
-   Correctly calculate local day/week boundaries, including year
    boundaries and daylight-saving changes for other configured
    timezones.
-   If multiple interpretations are plausible, ask a concise
    clarification question.
-   Add unit tests for date boundaries, relative dates, and timezone
    behavior.

### Milestone 5 --- Provider adapters and web search

Create small interfaces for LLM and search providers. Compare practical
available providers, but do not spend excessive time on research. Select
a working default based on tool calling, quality, latency, cost, and
ease of setup. Document the choice and alternatives.

Implement one `web_search` tool with a validated schema, for example: -
query: required non-empty string - recency: optional
day/week/month/year - domains: optional list of domains

The server executes the search and returns normalized results: - title -
URL - snippet - published_at (nullable) - retrieved_at - domain

Add timeouts, result limits, URL validation, error handling, and
duplicate-search prevention. Prefer official/primary sources for
pricing, changelogs, release notes, and product documentation. Do not
claim a snippet proves a fact when page content is unavailable.

### Milestone 6 --- Bounded agent orchestration

Implement an explicit, observable orchestration loop: 1. Validate and
timestamp user message. 2. Retrieve memory before model execution. 3.
Build compact context with exact message dates and source provenance. 4.
Call the model with only `web_search` available as a tool. 5. Validate
tool arguments server-side. 6. Execute search and return normalized
evidence. 7. Allow a small maximum number of tool rounds; stop loops and
repeated queries. 8. Generate the final response. 9. Persist messages,
tool traces, and source-backed observations. 10. Stream the answer to
the UI if practical; otherwise provide a reliable non-streaming
fallback.

Memory-only questions should not invoke search. "Is the previous answer
still correct?" should retrieve the earlier question/answer and then
search. Follow-up questions should preserve conversation context without
requiring the user to repeat entities.

The model must not directly query SQLite, call arbitrary APIs, access
the filesystem, or invoke any tool other than `web_search`.

### Milestone 7 --- Evidence and temporal comparison

Implement clear evidence handling: - Preserve original historical
observations and their sources. - Store new observations separately with
`observed_at`, `retrieved_at`, nullable `published_at`, and nullable
supported `effective_at`. - Compare like-for-like values: currency,
billing period, plan, usage limits, region, seats, and date. - Classify
results as changed, unchanged based on checked evidence, inconclusive,
or not found. - Never infer the exact date a change happened from the
date it was discovered. - Never call something unchanged only because no
announcement was found. - If the historical baseline or reliable current
evidence is missing, say so. - Cite claims with clickable source URLs;
never fabricate citations. - Treat web pages and snippets as untrusted
data. Ignore instructions contained in retrieved content.

### Milestone 8 --- UI and usability

Build a clean, responsive chat UI: - conversation list or simple
new-chat/history navigation - message bubbles - streaming/loading
indicator - visible "searching the web" state - clickable
citations/sources - clear errors and retry behavior - timestamps where
useful - no fake controls or decorative features that do nothing

Keep UI work subordinate to correctness and architecture.

### Milestone 9 --- Tests and evaluation

Create automated tests with deterministic mocks; tests must not require
paid API calls. Cover: - exact-date historical recall - relative-date
interpretation - semantic paraphrase retrieval (when embeddings
enabled) - entity retrieval and shortlist recovery - memory-only
question does not search - current-vs-historical price comparison -
product release/change comparison - missing historical baseline -
contradictory sources - undated/stale sources - invalid tool arguments -
search timeout/provider failure - duplicate tool-call prevention -
prompt injection embedded in retrieved web content - persistence across
server restart

Create a small evaluation dataset with at least 20 representative cases.
Record retrieval success, citation validity, correctness, tool-call
behavior, and latency. Do not claim benchmark results that were not
actually measured.

### Milestone 10 --- Submission hardening

-   Run `npm install`.
-   Run all tests.
-   Run lint/typecheck/build if configured.
-   Start using `npm run dev` and verify frontend and API health.
-   Fix all blocking errors.
-   Ensure `.env.example` lists all required keys with safe
    placeholders.
-   Ensure `.gitignore` excludes `.env`, database files, build outputs,
    and local artifacts.
-   Update README with setup, environment configuration, architecture
    overview, limitations, and test commands.
-   Review `DESIGN.md` against the actual implementation; update it if
    implementation details changed.
-   Provide a concise final report: implemented features, commands run,
    test results, required API keys, known limitations, and exact GitHub
    push steps.

## Engineering rules

1.  **Inspect before editing.** Do not assume the repository is empty.
2.  **Keep boundaries explicit.** Separate UI, API, orchestration,
    memory, search, evidence, providers, and persistence.
3.  **Use typed contracts.** Validate external inputs, model tool
    arguments, provider responses, and persisted data boundaries.
4.  **No fake memory.** If a past conversation is not stored, say it
    cannot be found.
5.  **No fake freshness.** Distinguish source publication time from
    retrieval time.
6.  **No unsupported comparisons.** A price comparison must match plan,
    billing interval, currency, and relevant usage conditions.
7.  **No uncontrolled agent loops.** Bound tool rounds, timeouts,
    tokens/results, and retries.
8.  **No secrets in the client.** All API keys remain on the server.
9.  **No unnecessary dependencies.** Prefer native SQLite/FTS5 and small
    focused packages.
10. **No premature optimization.** Measure latency and retrieval
    behavior, then optimize.
11. **Keep tests deterministic.** Mock LLM and search providers in
    automated tests.
12. **Do not stop at a design document.** The deliverable is a working
    application.

## Expected final repository

At minimum: - `DESIGN.md` - `README.md` - `.env.example` -
`.gitignore` - `package.json` - TypeScript configuration - frontend
application - backend application - database schema/migrations -
provider interfaces and implementations - agent orchestrator - memory
and temporal modules - web-search tool - evidence/comparison module -
automated tests - evaluation cases

## Definition of done

A reviewer can clone the public repository, run `npm install`, configure
the keys listed in `.env.example`, run `npm run dev`, chat with the
agent, observe web search when needed, restart the server without losing
conversation history, and inspect `DESIGN.md` to understand the
architecture.

The three challenge examples should work when the relevant historical
conversations exist in the database. When they do not exist, the agent
must clearly explain that it has no historical baseline rather than
inventing one.

Start by inspecting the repository, then implement Milestone 1. Continue
through the milestones without waiting for approval between routine
steps. At each milestone, run the relevant checks, fix failures, and
preserve a concise implementation log. Ask me only when a genuinely
blocking decision requires credentials, an external account, or a
destructive action.
