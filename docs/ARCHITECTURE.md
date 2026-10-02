# Architecture — My AI Work Agent

> Connect work. Understand context. Execute with AI.
>
> Status: **v0.1 — all layers implemented.** Column "Status" below is kept accurate per package. This document is the design contract for the
> project. Every section marks what is *implemented*, *planned*, or *demo-only*
> so the documentation never claims more than the code does.

## 1. System Overview

My AI Work Agent is a personal work agent. A user types a natural-language
request such as *"이번 주 내 개발 프로젝트 진행 상황을 정리해줘"*. The agent
decides which data it needs, calls tools exposed by MCP servers (GitHub, Gmail,
Google Calendar), aggregates the results into a single context, and asks an LLM
to turn that context into an actionable **Weekly Work Report**.

```
USER ──► AI AGENT ──► MCP CLIENT ──► MCP SERVERS ──► EXTERNAL SERVICES
                │                        (github, gmail, calendar)
                ▼
         CONTEXT AGGREGATION ──► AI ANALYSIS ──► ACTIONABLE REPORT
```

The project is a monorepo (npm workspaces):

| Path | Role | Status |
| --- | --- | --- |
| `apps/api` | Hono HTTP server. Hosts the agent, spawns MCP servers per run, OAuth callbacks, encrypted token store. Streams agent events over SSE. | **implemented** |
| `apps/web` | React + Vite + Tailwind agent UI (prompt → activity timeline → report, integrations panel). | **implemented** |
| `mcp-servers/github` | MCP server exposing GitHub tools. Runs standalone over stdio; demo and real providers. | **implemented** |
| `mcp-servers/gmail` | MCP server exposing Gmail tools; demo and real providers. | **implemented** |
| `mcp-servers/calendar` | MCP server exposing Google Calendar tools; demo and real providers. | **implemented** |
| `packages/shared` | Types shared across apps: tool schemas (zod), report schema, agent events, project metadata. | **implemented** |
| `packages/agent-core` | Provider-agnostic agent loop, LLM provider abstraction, MCP client, context aggregation, report validation. No HTTP, no UI. | **implemented** |
| `portfolio` | Interactive 3D portfolio (React Three Fiber) with presentation mode; data generated from the servers. | **implemented** |
| `motion` | Remotion composition, 45 s, 1080p. | **implemented** |
| `docs` | Architecture, decision log, What/Why/How notes, setup guide. | **implemented** |

`packages/ui` and `apps/agent` from the original proposal are intentionally
omitted (see `docs/DECISIONS.md`, ADR-001): the agent lives in a library package
and is hosted by `apps/api`; a separate UI package adds no value with one
consumer app.

## 2. Agent Architecture

`packages/agent-core` implements a small, explicit agent loop. It is not a
hidden chain-of-thought; it is a state machine whose transitions are emitted as
`AgentActivityEvent`s and rendered in the UI as a timeline.

```
                     ┌───────────────────────────────┐
  user request ────► │ 1. plan      (LLM, tool list)  │
                     │ 2. execute   (MCP tool calls)  │ ◄── loops while the
                     │ 3. aggregate (normalize)       │     LLM requests tools
                     │ 4. analyze   (LLM, report)     │
                     │ 5. validate  (schema + sources)│
                     └───────────────────────────────┘
                                   │
                                   ▼  WeeklyReport (typed JSON) + activity log
```

Key pieces:

- **LLM provider abstraction.** `LLMProvider` is an interface with one method,
  `complete({ system, messages, tools, responseFormat })`, returning text and/or
  tool calls. Concrete providers: `AnthropicProvider` (default),
  `OpenAIProvider`, `OpenAICompatibleProvider` (any base URL, e.g. Ollama/vLLM),
  and `ScriptedProvider` used in Demo Mode and tests (ADR-009). Selected by
  `LLM_PROVIDER`; falls back to scripted when no key is set.
- **Tool selection.** The agent does not hard-code which MCP tools to call. It
  lists tools from every connected MCP server (`tools/list`), hands the
  JSON-schema tool definitions to the LLM, and executes whatever tool calls the
  model returns. A per-request *tool policy* (allow-list + max calls + timeout)
  caps what the model may do.
- **Context aggregation.** Each tool result is normalized into a
  `ContextItem { source, kind, id, timestamp, title, body, url, raw }`. Items are
  de-duplicated, time-filtered (default: current ISO week), and grouped by
  project heuristics (repo name, email subject keywords, event title).
- **Report generation.** The LLM receives the aggregated context plus a strict
  JSON schema for `WeeklyReport`. Every bullet carries `sources: ContextItemRef[]`
  and `confidence: "observed" | "inferred"`. A post-validation step rejects any
  bullet that cites a source id that does not exist in the context — this is
  the primary hallucination guard.
- **Activity stream.** The agent emits events (`request_understood`,
  `tool_call_started`, `tool_call_finished`, `context_aggregated`,
  `report_generated`, `error`). The API forwards them over Server-Sent Events;
  the UI renders them as the `AGENT ACTIVITY` timeline. Reasoning tokens are
  never forwarded.

## 3. MCP Architecture

Each integration is a real MCP server built with the official
`@modelcontextprotocol/sdk` and started by the API as a child process over the
**stdio transport**. The API holds one `McpClient` per server.

```
apps/api (McpClient x3)
   ├─ stdio ─► mcp-servers/github    tools: get_recent_commits, get_pull_requests,
   │                                        get_open_issues, get_repository_activity
   ├─ stdio ─► mcp-servers/gmail     tools: search_emails, get_email, search_project_emails
   └─ stdio ─► mcp-servers/calendar  tools: get_events, get_upcoming_events, search_events
```

Design rules:

- Tool `inputSchema` and output types are defined once in `packages/shared`
  with zod and reused by server, client, UI, and the MCP Explorer slide.
- Each server runs standalone (`node dist/index.js`) and can be attached to any
  MCP-compatible host (e.g. Claude Desktop) — this is the actual point of using
  MCP instead of direct API calls (ADR-002).
- Servers receive credentials **only** through environment variables or a
  short-lived token passed at spawn time by the API. They never read `.env`
  themselves in production paths.
- Each server has a `--mode=demo` flag. In demo mode it serves fixtures from
  `fixtures/*.json` through the *same* tool interface, so the MCP wiring is
  exercised end-to-end even without credentials.

## 4. Data Flow

1. `POST /api/agent/run { prompt, mode }` → API creates a run id and returns an
   SSE stream `/api/agent/runs/:id/events`.
2. Agent `plan` step: LLM receives the prompt and the merged tool list.
3. For each tool call the LLM returns, the API's `McpClient` issues
   `tools/call` to the owning server. Results are normalized to `ContextItem`.
4. When the LLM stops requesting tools, the aggregated context is sent to the
   `analyze` step with the `WeeklyReport` JSON schema.
5. The validated report plus the activity log is stored in memory (and
   optionally SQLite, see §8) and returned to the UI.

Nothing is persisted by default. A run lives in process memory (`MemoryRunStore`,
last 50 runs) and is gone on restart; this keeps the first version free of a
database (ADR-004). In Real Mode only connected servers are spawned (ADR-011).

## 5. Authentication Flow

Real Mode uses OAuth 2.0 authorization-code flow, handled entirely by
`apps/api`. The browser never sees client secrets or refresh tokens.

```
web ──(1) GET /auth/github/start──► api ──302──► github.com/login/oauth/authorize
web ◄─(2) callback /auth/github/callback?code ─── github
api ──(3) exchange code → access token (server-side, CLIENT_SECRET from env)
api ──(4) store token in encrypted session store (file or SQLite, AES-GCM)
api ──(5) spawn mcp-servers/github with GITHUB_TOKEN=<token> for this user
```

Google (Gmail + Calendar) uses the same flow with
`https://www.googleapis.com/auth/gmail.readonly` and
`.../calendar.readonly` scopes — **read-only scopes only**.

Connection status is reported honestly per provider:
`not_configured` (no client id in env) → `disconnected` → `connected`.
The UI shows "Connect GitHub" / "Connect Google", never "Connected" unless a
valid token exists.

## 6. Demo Mode

Demo Mode exists so the full UX runs with zero credentials and zero LLM cost.

| Layer | Real Mode | Demo Mode |
| --- | --- | --- |
| MCP servers | Call GitHub / Google APIs | Same servers, `--mode=demo`, serve fixtures |
| MCP transport | stdio | stdio (unchanged) |
| LLM | Configured provider | `ScriptedProvider` replays a recorded tool-call plan and a fixture report; if `LLM_API_KEY` is set, the real LLM can run over demo fixtures ("demo data + real LLM") |
| UI | normal | persistent `DEMO MODE` badge on header, activity, and report |

Demo fixtures (12 commits, 3 PRs, 4 issues, 4 events, 8 emails) are clearly
synthetic (user `demo-user`, repo `demo-org/my-ai-work-agent`). The mode is a
single switch resolved on the API (`AGENT_MODE=demo|real`, overridable per
request) and is propagated into every event and the report metadata, so the
frontend can never show demo output without the badge.

## 7. Security Model

- Secrets live only in `.env` (git-ignored) and are read once at API start;
  `.env.example` documents every variable.
- OAuth tokens are encrypted at rest with a key from `SESSION_ENCRYPTION_KEY`
  and are never logged, never sent to the browser, never embedded in prompts.
- MCP servers get the minimum credential for their job via env at spawn time.
- Read-only scopes everywhere; the agent has no write tools in v1.
- The LLM sees tool *results*, not credentials. Tool results are size-capped
  before being placed in the prompt.
- Tool policy: allow-list, max 12 tool calls per run, 20 s timeout per call.
- Prompt-injection surface: email bodies and issue text are untrusted. They are
  wrapped in delimited data blocks in the prompt and the system prompt instructs
  the model to treat them as data. Output is schema-validated, so injected
  instructions cannot produce arbitrary actions (there are no write tools).
- `.gitignore` excludes `.env`, `.env.*` (except `.env.example`), token stores,
  and build output. CI runs gitleaks on every push (`.github/workflows/ci.yml`).

## 8. Future Expansion

- **More MCP servers**: Slack, Notion, Jira — each is a new folder under
  `mcp-servers/`, no agent changes required because tools are discovered at
  runtime.
- **Persistence**: a `RunStore` interface with `MemoryRunStore` first;
  `SqliteRunStore` (better-sqlite3) when history is needed; PostgreSQL behind
  the same interface for multi-user deployments.
- **Scheduling**: cron-triggered weekly runs that email the report.
- **Write tools with human approval**: e.g. "create follow-up issue", gated
  behind an explicit confirm step in the UI.
- **Evaluation**: a fixture-based eval suite that scores reports on source
  grounding (every claim cites a real context item) and coverage.
- **Multi-user / enterprise**: per-user token isolation, audit log of every
  tool call, policy engine deciding which tools a user may expose to the
  agent — the problem space that makes this an *AX* project rather than a
  chatbot.
