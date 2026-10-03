# My AI Work Agent

> **내 메일을 AI에 맡겨도 될까?** — 그 질문에 코드로 답한 개인 업무 에이전트.
>
> GitHub·Gmail·캘린더·eCampus를 MCP로 읽어 이번 주 할 일과 마감을 출처와 함께 정리하고, **AI에 무엇을 보냈고 무엇을 막았는지**를 서명된 기록으로 남깁니다.

**▶ 바로 보기: [mawa-epm.pages.dev](https://mawa-epm.pages.dev/)** — 설치 없이 브라우저에서 열리는 데모(가상의 샘플 데이터). 학생 · 직장인 · 관리자 화면을 위쪽에서 전환합니다. 내 계정으로 돌리는 방법은 [docs/REAL_RUN.md](docs/REAL_RUN.md).

**The story in three steps**

1. **A student's problem.** My week is scattered across GitHub, Gmail, Calendar and eCampus — and my mail also holds my 주민등록번호, my bank account, my friends' numbers. An agent that reads all of it for me must not hand all of it to a model.
2. **What the agent does about it.** MCP servers per source; the model picks the tools; every sentence cites a fetched source (or is dropped); before anything reaches the model, a data policy hides tools, narrows arguments, drops rows, masks identifiers and pseudonymizes names; an **omission check** re-reads the next two weeks deterministically and flags what the report missed; a hand-written **eval set** scores how much each report found.
3. **The same problem at work.** The worker persona (fictional B사) has customers' numbers instead of friends'. The policy moves out of the agent into an **MCP gateway** any client (Claude Code included) goes through, with per-user tokens and a **hash-chained, Ed25519-signed audit log** that the admin persona reads.

```
USER → AI AGENT ─┐                                   ┌→ GitHub
                 ├→ (policy · masking · audit) → MCP ├→ Gmail
CLAUDE CODE ─────┘        gateway / agent            ├→ Calendar
                                                     └→ eCampus
REPORT ← source validation ← omission check ← eval
```

| | |
| --- | --- |
| Agent UI | `apps/web` — ask, watch MCP tool execution, read the report |
| 3D portfolio | `portfolio` — a pitch deck in the browser, with presentation mode |
| Motion graphic | `motion` — 45 s Remotion video |
| Docs | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/DECISIONS.md`](docs/DECISIONS.md) · [`docs/IMPLEMENTATION.md`](docs/IMPLEMENTATION.md) · [`docs/SETUP.md`](docs/SETUP.md) |

- 내 GitHub 계정으로 직접 돌려보기: [docs/REAL_RUN.md](docs/REAL_RUN.md)

## Overview

Type a request such as *"이번 주 공부·개발이랑 팀플 진행 상황 정리해줘."* The agent discovers the tools exposed by three MCP servers, calls the ones it needs, normalizes every commit / PR / issue / email / event into a **Source** with a stable id, asks an LLM for a report constrained to a JSON schema, and then **mechanically rejects any bullet that cites a source id that does not exist**. The UI shows the tool calls as a timeline and the report with per-item source chips.

Everything runs with zero credentials in **Demo Mode**: the same MCP servers serve synthetic fixtures and a scripted provider stands in for the LLM. Demo output is labelled `DEMO MODE` everywhere, driven by a `mode` field that is mandatory on every event and on the report.

## Why I Built This

QueryPie의 AX Engineer 포지션을 접하면서 AI Agent와 MCP가 실제 업무 환경에서 어떻게 활용될 수 있는지 직접 이해하고 싶어 이 프로젝트를 시작했다. "AI를 써봤다"가 아니라 "AI가 여러 업무 도구의 맥락을 이해하고, 그 맥락을 실행 가능한 결과로 바꾸는 시스템을 설계할 수 있다"를 보여주는 것이 목표다.

This is a personal learning and portfolio project. It does not imitate, reproduce, or relate to any company's product or internal systems.

## Problem

Your work already has the data. GitHub knows what you shipped, Gmail knows what people asked of you, Calendar knows where the week went. None of them share context, so every weekly update is a human re-aggregating what the tools already know.

## Solution

One agent, connected context. Integrations are not hard-coded into the agent: each is an MCP server that the agent discovers at runtime. Adding Slack or Notion later is a new server directory, not an agent change.

## What You Can Do With It

**Three personas, one service.** The demo switches between a **student** (이성준, CBNU: classes, a capstone team, internship prep — GitHub, Gmail, Calendar, eCampus), a **worker** (정하은, backend developer at the fictional fintech B사: reviews, an incident, a customer request, a 1:1 — GitHub, Gmail, Calendar) and the **admin** who sets the policy for B사 and reads the audit (first screen: a security summary, the policy comparison, Claude Code through the gateway). Same agent, servers and controls; each user's own synthetic week, vocabulary (수업·과제 ↔ 업무·마감, 학사 ↔ 인사·행정) and example questions. `--persona=worker` selects the worker's fixtures for the MCP servers (`MAWA_PERSONA`), `npm run ask`, the gateway and the recorders.

Built for my own week as a CBNU software student (classes, a capstone team, internship applications, algorithm study) and designed around one question a data-access company would ask: *what did the agent read, what did it send to the model, and can I prove it?*

| Situation | What the agent does |
| --- | --- |
| "What's due?" | Orders assignments, quizzes, presentations and applications by D-day from **eCampus (CBNU's Moodle LMS)**, calendar events and dates written in mail ("10월 9일까지"), with my submission status (*임시저장만 됨*) and the open work behind each; flags LMS deadlines missing from the calendar |
| Weekly review | Commits per repo, Baekjoon problems solved, team PRs, class and team mail, upcoming deadlines, one summary |
| Team project | Merges a teammate's mail and the meeting that reference the same `#N` into one item; "PR #8 waits for **my** review"; unassigned issues become "decide who owns it" |
| Internship prep | Next selection step with D-day, coding-test prep from what was solved this week, portfolio work in progress |
| Catching slips | A mail that says Oct 14 while the calendar says Oct 15; an injection-like "bot" mail flagged and kept out of the report |
| Sharing | A short 한 일 / 할 일 / 막힌 것 update for Slack/Discord, or the full report as Markdown |
| Control and proof | A **data access policy**: allowed MCP tools (hidden from the model *and* refused at the call boundary if it names one anyway), phrases whose items never reach the LLM or the report, masking of email addresses and personal identifiers (phone, 학번, 주민등록번호, account and Luhn-valid card numbers, counted per kind), and optional pseudonyms for people's names (the model sees 사람A, the report shows the real name). The API server owns the base policy (`POLICY_PATH`); a request can only tighten it. A **security summary** and an **audit log** page with a **SHA-256 hash chain** written by the server as runs finish (`AUDIT_LOG_PATH`, served at `/api/audit`; the demo ships its chain) (verify in the browser, see an edited line fail, verify a downloaded file or `npm run audit:verify`), a data-use panel per run, the same question recorded under **three policies** (none / default / strict) side by side, and source validation that drops citations of data that was never fetched |
| Any MCP client | The **policy gateway** (`mcp-servers/gateway`): one MCP server in front of the four, applying the same policy, masking and hash-chained audit (with the client's name) to Claude Code, Claude Desktop or this agent. [Recorded run of Claude Code through it](docs/examples/gateway-claude-code.md) |

It only reads; there are no write tools. The public demo replays recorded runs over a fictional week shaped after mine (synthetic data, a fictional company "A사"); with the API server, OAuth and an LLM key it runs on your own accounts.

## Architecture

Monorepo (npm workspaces, Node 22, TypeScript strict):

```
apps/api            Hono host: runs, SSE event stream, OAuth, status
apps/web            React agent UI
packages/shared     zod schemas: tool contracts, report (with source integrity), events, project metadata
packages/agent-core LLM provider abstraction, MCP client, agent loop, aggregation, report validation
mcp-servers/github  MCP server: get_recent_commits, get_pull_requests, get_open_issues, get_repository_activity
mcp-servers/gmail   MCP server: search_emails, get_email, search_project_emails
mcp-servers/calendar MCP server: get_events, get_upcoming_events, search_events
portfolio           Interactive 3D presentation (separate Vite app)
motion              Remotion motion graphic
scripts/            export-portfolio-data.mjs (snapshots real servers into the portfolio)
docs/               architecture, decisions, implementation notes, setup
```

Full design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Decisions and their reasoning: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## MCP Architecture

Each integration is a standalone MCP server built on the official `@modelcontextprotocol/sdk`, started over **stdio** with `--mode=demo|real`. Tools have zod input schemas and `{ summary, data }` outputs; every data row carries a namespaced `sourceId` (`github:commit:…`, `gmail:msg:…`, `calendar:event:…`) that the report can cite.

The MCP client lives in `packages/agent-core` (`McpToolExecutor`): one SDK `Client` per server, `tools/list` for discovery, `tools/call` for execution. Child processes receive only the token they need, never the API's own secrets. The servers can also be attached to any other MCP host:

```bash
node mcp-servers/github/dist/index.js --mode=demo      # or GITHUB_TOKEN=… --mode=real
```

## Agent Workflow

`runAgent()` in `packages/agent-core/src/agent.ts`:

1. `agent_run_started`
2. `tool_discovery_started` → `mcp_server_connected` per server (from its `initialize` response: name, version, protocol version, capabilities) → `tool_discovered` (tools/list on every server). Every JSON-RPC message on each stdio pipe is also emitted as `mcp_message` (direction, method, id, real size, shortened body), so the UI shows the protocol, not a picture of it
3. plan: the LLM receives the user's request plus the discovered tool definitions and returns tool calls
4. execute: each call is `tool_call_started` → `tool_call_completed | tool_call_failed`; a policy caps calls (12), turns (4) and result size
5. `context_aggregated`: rows → Sources + ContextItems, de-duplicated, sorted
6. analyze: the LLM receives the context and a JSON schema; the agent drops items citing unknown ids, downgrades unsourced "observed" items to "inferred", and validates with `WeeklyWorkReportSchema`
7. `report_generated` → `agent_run_completed`

Around every LLM request the agent emits `llm_request` (size, what was included, how many email addresses were masked, which third-party items looked like instructions) and, on planning turns, `llm_response` (the tool calls chosen). The report page turns these into a data-use panel with a JSONL audit export.

Only these events reach the UI. Model reasoning is never emitted.

## Tech Stack

React 19 · TypeScript · Vite 8 · Tailwind 4 · Three.js / React Three Fiber / drei · Framer Motion · GSAP (available) · Node 22 · Hono · `@modelcontextprotocol/sdk` · zod 4 · Anthropic SDK · OpenAI SDK · `@octokit/rest` · `googleapis` · Remotion · Vitest · Playwright · ESLint 10.

## Live Demo

Demo mode runs **for free, with no API key and no server**: `apps/web` has a browser-only build that replays runs recorded from the real agent + MCP pipeline over synthetic fixtures. The UI code path is the same one a live run uses (same events, same report schema, same source-integrity validation), so what you see is the real product UX, labelled as a demo workspace with sample data (`데모 워크스페이스 · 샘플 데이터`, `기록 재생`). In the demo, tool selection comes from a per-question plan (`scripted-heuristics-v1`), and the UI says so; with `LLM_API_KEY` on the API server, the model chooses the tools.

```bash
npm run build:demo           # → apps/web/dist-demo (static, deploy anywhere)
npm run preview:demo -w apps/web
```

The four example requests are exactly the prompts that were recorded with the scripted planner; one more run (`실제 LLM 기록`) was recorded with a real model (Claude Code CLI) choosing the tools over the same sample data (`LLM_PROVIDER=claude-cli npm run record:llm-run`). Free-form prompts need the API server. The UI follows the system light/dark setting, with a toggle in the top bar. Each run is addressable (`#/report/<runId>`), its report can be copied as Slack mrkdwn or Markdown (items can be excluded first), and its full event trace (tool inputs, outputs, per-call MCP time) is viewable and downloadable as JSON. Recordings are regenerated from the real servers with `npm run export:portfolio-data` into `packages/shared/demo/`.

## Demo vs Real

| | DEMO (browser-only build) | DEMO (API, default `npm run dev`) | REAL |
| --- | --- | --- | --- |
| Needs | nothing | Node | Node + OAuth apps (+ LLM key) |
| Data | synthetic fixtures, recorded | synthetic fixtures, live MCP calls | your GitHub / Gmail / Calendar via OAuth |
| MCP servers | recorded `tools/list` + `tools/call` | spawned per run, `--mode=demo` | spawned per run, `--mode=real` |
| LLM | none (replay) | scripted, or a real model with `LLM_API_KEY` | scripted, or a real model |
| Network from the page | none | same-origin API only | same-origin API only |

## Demo Mode

`AGENT_MODE=demo` (the default) spawns all three MCP servers with `--mode=demo`. They serve clearly synthetic fixtures (user `demo-user`, 12 commits, 3 PRs, 4 issues, 9 emails, 5 events) with dates rebased to the current week. Without `LLM_API_KEY`, the `ScriptedProvider` replays a fixed tool plan and builds the report with heuristics; the UI shows `LLM: scripted (no API key)`. With a key, a real model runs over the demo fixtures. The pipeline, transport and UI are identical to Real Mode (ADR-006).

## Real Mode

Real Mode uses only the integrations you have connected through OAuth: the API spawns a server **only** for connected services (GitHub with your token; Gmail and Calendar with your Google token) and skips the rest, so a `real` report never mixes in demo data. `/api/status` reports each integration as `not_configured`, `disconnected` or `connected`, and the UI's Real toggle stays disabled until something is connected. Only read endpoints are ever called. Google scopes are read-only (`gmail.readonly`, `calendar.readonly`). **GitHub is different:** an OAuth App's `repo` scope is read *and* write because GitHub offers no read-only repository scope for OAuth Apps. For least privilege, register a **GitHub App** with read-only permissions and set `GITHUB_OAUTH_SCOPES=""` (see [`docs/SETUP.md`](docs/SETUP.md)). Tokens are exchanged server-side and encrypted at rest with AES-256-GCM.

## Environment Variables

See [`.env.example`](.env.example). Nothing is hard-coded; `.env` is git-ignored.

| Variable | Purpose |
| --- | --- |
| `AGENT_MODE` | `demo` (default) or `real` |
| `LLM_PROVIDER` | `anthropic` (default), `openai`, `openai-compatible`, `claude-cli` (uses the local Claude Code login, no key), `scripted` |
| `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | provider credentials; `LLM_BASE_URL` for OpenAI-compatible endpoints |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth App or GitHub App OAuth credentials |
| `GITHUB_OAUTH_SCOPES` | scopes for an OAuth App (default `read:user repo`); set to empty for a GitHub App |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client |
| `SESSION_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`); without it tokens are memory-only |
| `API_PORT`, `WEB_ORIGIN`, `API_PUBLIC_URL`, `TOKEN_STORE_PATH` | server settings |
| `API_HOST` | interface to bind; `127.0.0.1` by default (run records contain mail and calendar data) |
| `API_ACCESS_TOKEN` | optional shared secret (≥16 chars); when set, `/api/*` and disconnect require it and the UI asks for it once |
| `LMS_BASE_URL` | Moodle LMS for the eCampus MCP server (default `https://lms.chungbuk.ac.kr`); connect in the UI with your own LMS login |
| `RUN_STORE_PATH` | with `SESSION_ENCRYPTION_KEY`, finished runs are kept encrypted here (last 30) so reports can be compared week to week |

## Setup

```bash
git clone https://github.com/djkdb/mawa.git && cd mawa
npm install
cp .env.example .env     # optional for demo mode
```

OAuth app and LLM configuration for Real Mode: [`docs/SETUP.md`](docs/SETUP.md).

## Running the Project

```bash
npm run dev        # builds TS packages, then starts api (:3001), web (:5173), portfolio (:5174)
npm run build      # builds every workspace (shared, agent-core, mcp servers, api, web, portfolio; motion typechecks)
npm run test       # vitest: schemas, MCP servers over stdio, agent loop, API, demo client (vitest)
npm run test:e2e   # Playwright: API-backed UI, portfolio, and the standalone demo build (run npm run build first)
npm run lint       # eslint
npm run ask -- "질문"  # ask from the terminal; LLM_PROVIDER=claude-cli lets the model pick the MCP tools (docs/SETUP.md)
npm run audit:verify -- file.jsonl   # verify a hash-chained audit log (web export or gateway --audit)
npm run record:gateway-run           # Claude Code → policy gateway → demo servers, saves answer + audit
npm run typecheck  # tsc -b + Vite apps
```

## MCP Servers

| Server | Tools | Real provider |
| --- | --- | --- |
| `mcp-servers/github` | `get_recent_commits`, `get_pull_requests`, `get_open_issues`, `get_repository_activity` | GitHub REST via `@octokit/rest`, `GITHUB_TOKEN` (verified against the real API: commits, PRs, issues of this repository) |
| `mcp-servers/gmail` | `search_emails`, `get_email`, `search_project_emails` | Gmail API, `gmail.readonly` |
| `mcp-servers/calendar` | `get_events`, `get_upcoming_events`, `search_events` | Calendar API, `calendar.readonly` |

Each server has integration tests that spawn the built binary and drive it with the official MCP client.

## Policy Gateway

`mcp-servers/gateway` is the policy layer as its own MCP server, so the controls do not depend on this agent:

```sh
npm run build
claude mcp add mawa-gateway -- node $PWD/mcp-servers/gateway/dist/index.js \
  --mode=demo --policy=$PWD/mcp-servers/gateway/policy.example.json --audit=$PWD/gateway-audit.jsonl
npm run audit:verify -- gateway-audit.jsonl
```

Remote mode for more than one person: `--http=8787 --users=gateway-users.json` serves Streamable HTTP; each request needs a Bearer token (`--new-token=<user>` prints one and the users-file entry, which stores only its SHA-256), sessions are bound to that user, a user's policy can only tighten the gateway's, and every audit line names the user.

Tools outside `allowedTools` are absent from `tools/list` and refused on `tools/call`; results are filtered by `exclude`, masked (`maskEmails`, `maskPii`) and screened for instructions before they reach the client; every call is appended to a hash-chained JSONL log with the client name from the MCP handshake. `--mode=real` starts the servers whose credentials are in the environment. What an organisation would add on top (identity, policy lifecycle, approvals, retention, DLP): [docs/ENTERPRISE.md](docs/ENTERPRISE.md).

## Agent

`packages/agent-core` exports `runAgent`, `McpToolExecutor`, the `LLMProvider` interface with `AnthropicProvider`, `OpenAIProvider`, `OpenAICompatibleProvider`, `ScriptedProvider`, `aggregateContext`, `generateReport` and a `RunStore` seam (`MemoryRunStore` in v1).

## Frontend

`apps/web` renders the prompt panel, the `AGENT ACTIVITY` timeline (derived purely from events), the report with `observed` / `inferred` markers and clickable `Source:` chips, and the integrations panel. Desktop-first, responsive to mobile, keyboard-accessible controls, `aria-live` on the timeline.

`portfolio` is a ten-slide 3D presentation (Hero, Problem, Solution, Architecture, Live demo, MCP explorer, AX thinking, Learnings, About, Final). `←` `→` `Space` navigate, `P` enters Presentation Mode, `Esc` exits; wheel/touch scrolling works too. The MCP explorer and the demo replay are generated from the real servers by `npm run export:portfolio-data`, and the demo slide is labelled as a recorded replay.

## Motion Graphic

```bash
npm run studio -w motion    # Remotion studio
npm run render -w motion    # motion/out/my-ai-work-agent.mp4 (1080p, 30 fps, 45 s)
```

Story: Work is everywhere → GitHub · Gmail · Calendar → One protocol (MCP) → One Agent → Tool execution → Weekly Report → AI × MCP × AX, @zun_it_.

## Architecture Diagram

```
┌──────────┐   prompt    ┌──────────────────────────────┐
│ apps/web │ ──────────▶ │ apps/api  (Hono, SSE, OAuth) │
└──────────┘ ◀────────── │  └─ agent-core.runAgent()    │
     events / report     │       ├─ LLMProvider          │ ── Anthropic | OpenAI | compatible | scripted
                         │       └─ McpToolExecutor      │
                         └──────────┬─────────┬──────────┘
                              stdio │         │ stdio          stdio
                         ┌──────────▼┐  ┌─────▼─────┐  ┌───────▼──────┐
                         │ github MCP│  │ gmail MCP │  │ calendar MCP │
                         └─────┬─────┘  └─────┬─────┘  └──────┬───────┘
                           GitHub API     Gmail API      Calendar API      (or fixtures in demo mode)
```

## Deployment

The static apps deploy to any static host; the API needs a Node host (it spawns MCP servers as child processes, so serverless platforms do not fit).

**Cloudflare Pages — agent demo (browser-only)**

```
Build command:      npm ci && npm run build -w @mawa/shared && npm run build:demo -w @mawa/web
Build output:       apps/web/dist-demo
Environment:        NODE_VERSION=22
                    VITE_PUBLIC_URL=https://<your-demo-domain>      (absolute og:image / og:url)
```

The agent demo is a standalone product surface: it does not link to the portfolio. The portfolio links to the demo (`VITE_LIVE_APP_URL`).

**Cloudflare Pages — portfolio**

```
Build command:      npm ci && npm run build -w @mawa/shared && npm run build -w @mawa/portfolio
Build output:       portfolio/dist
Environment:        NODE_VERSION=22
                    VITE_PORTFOLIO_URL=https://<your-portfolio-domain>
                    VITE_LIVE_APP_URL=https://<your-demo-domain>
                    VITE_CONTACT_EMAIL=you@example.com               (optional; hides the button when unset)
```

Both apps depend only on `@mawa/shared` (built first). They are single-page apps without client-side routing, so no SPA fallback rule is needed. Render Static Sites and Netlify take the same commands and output directories.

**API (Real Mode)** — Railway, Fly.io, Render, or a machine behind Cloudflare Tunnel: build with `npm ci && npm run build`, run `node apps/api/dist/index.js`, set the variables from `.env.example` as secrets, mount a volume for `TOKEN_STORE_PATH`, and register `<API_PUBLIC_URL>/auth/{github,google}/callback` as OAuth redirect URIs. Deploy `apps/web` with the normal `npm run build -w @mawa/web` and `VITE_API_URL` pointing at the API.

## Lessons Learned

- **MCP earns its process boundary.** Credentials and schemas live with the server; the agent never sees a token and discovers capabilities instead of importing them.
- **Validate the model's output structurally, not rhetorically.** Telling the model "cite sources" is a hint; rejecting unknown ids in a zod `superRefine` is a guarantee.
- **Demo Mode must be a mode, not a mock.** A separate fake path would have drifted from the real one within a week.
- **`mode` belongs in the data.** Making it mandatory on every event is what makes the DEMO badge impossible to forget.
- **Tool budgets matter more than prompts.** A hard cap on calls and result size kept both cost and latency predictable.

## Future Improvements

A recorded real-LLM run (`LLM_API_KEY=… npm run record:llm-run` adds one to the demo, labelled with the model); more MCP servers (Slack, Notion, Jira); scheduled weekly runs; write tools gated behind explicit human approval; a fixture-based evaluation suite scoring source grounding and coverage; per-user token isolation and tool-call audit logs for multi-user deployments. See `docs/ARCHITECTURE.md` §8.

---

Built by **Lee Seongjun** · Software Engineering, Chungbuk National University · Instagram [@zun_it_](https://www.instagram.com/zun_it_/) · AI × MCP × AX
