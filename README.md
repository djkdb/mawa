# My AI Work Agent

> **내 메일을 AI에 맡겨도 될까?** — 그 질문에 코드로 답한 개인 업무 에이전트.
>
> GitHub·Gmail·캘린더·eCampus를 MCP로 읽어 이번 주 할 일과 마감을 출처와 함께 정리하고, **AI에 무엇을 보냈고 무엇을 막았는지**를 서명된 기록으로 남깁니다.

**▶ 바로 보기: [mawa-epm.pages.dev](https://mawa-epm.pages.dev/)** — 설치 없이 브라우저에서 열리는 데모(가상의 샘플 데이터). 처음 열면 1분짜리 시작 가이드(실행 → 사무실에서 지켜보기 → 근거와 함께 읽기)가 뜹니다. 학생 · 직장인 · 관리자 화면을 위쪽에서 전환하고, 라이트/다크 테마를 고를 수 있습니다.

**에이전트 사무실** — 실행을 도트 사무실로 보여 줍니다. MCP 서버마다 담당자 한 명(GitHub·메일·일정·eCampus), 방 사이를 오가며 자료를 받아 오는 에이전트, 보안 게이트 뒤의 AI 코어. 게이트에서 정책이 가린 개인정보가 떨어져 나가는 장면까지 모든 움직임이 실제 실행 이벤트 하나하나에서 나옵니다(다크 모드는 야간 관제실, 라이트 모드는 낮 사무실).

**실제 계정으로도 돕니다.**
- **터미널** — 2026-10-03, Windows에서 내 GitHub(읽기 전용 토큰) + Claude Code 로그인으로 `npm run ask -- --mode=real` 실행: 모델이 GitHub 도구 4개를 골라 호출, 출처 113건이 붙은 리포트 ([실행 기록 원본](docs/examples/real-run-2026-10-03.txt))
- **웹 서비스** — 2026-10-05, 같은 Windows PC에서 `npm run start:real`로 실행: GitHub App(읽기 전용)과 eCampus를 연결하고 실제 모드 실행이 사무실 화면에 실시간(LIVE)으로 표시됨. 연결 → 질문 → 실시간 활동 → 리포트·출처. 실제 실행 화면에는 실행 이벤트에서 나온 「실제 실행 · 실제 데이터 · 시작 시각 · 모델」 한 줄이 뜨고, 데모 실행에서는 뜨지 않습니다. `?record=1`은 녹화용으로 계정 이름을 가립니다
- **헤드리스 녹화** — 브라우저 승인을 누를 수 없는 클라우드 세션은 `MAWA_GITHUB_TOKEN`(읽기 전용)으로 `npm run record:web`을 돌려 실제 실행을 영상으로 남깁니다
- **처음 쓰는 사람용** — 실제 모드 홈에는 준비 점검표가 뜹니다: AI 연결 확인(모델에 아주 짧은 요청 1회, `POST /api/llm/check`) → 서비스 연결 → 첫 정리 실행. 실패는 한국어로 원인과 할 일을 보여 주고(로그인 만료, CLI 못 찾음, 연결 없음, 토큰 만료, API 꺼짐 …) 원문은 접어 둡니다
- 따라 하기: [docs/REAL_RUN.md](docs/REAL_RUN.md) — 터미널 · 웹(`npm run start:real` 한 줄: 빌드 → `npm run doctor` 점검 → API + 웹) · **Gmail·Google Calendar 연결**(Google Cloud OAuth, 테스트 사용자, 읽기 전용) · 클라우드 녹화

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


## Overview

Type a request such as *"이번 주 공부·개발이랑 팀플 진행 상황 정리해줘."* The agent discovers the tools exposed by four MCP servers (GitHub, Gmail, Calendar, eCampus), calls the ones it needs, normalizes every commit / PR / issue / email / event into a **Source** with a stable id, asks an LLM for a report constrained to a JSON schema, and then **mechanically rejects any bullet that cites a source id that does not exist**. The UI shows the tool calls as a timeline and the report with per-item source chips.

Everything runs with zero credentials in **Demo Mode**: the same MCP servers serve synthetic fixtures and a scripted provider stands in for the LLM. Demo output is labelled `데모 워크스페이스 · 샘플 데이터` everywhere, driven by a `mode` field that is mandatory on every event and on the report.

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
mcp-servers/lms     MCP server: CBNU eCampus (Moodle) assignments, quizzes, deadlines
mcp-servers/gateway MCP policy gateway in front of the four (stdio or Streamable HTTP, signed audit)
portfolio           Interactive 3D presentation (separate Vite app)
motion              Remotion motion graphic
scripts/            ask, doctor, record-web-run, record-llm-run, record-gateway-run, eval, verify-audit, export-portfolio-data
e2e/                Playwright specs; e2e/fakes: fake GitHub (OAuth + REST) and fake claude for real-mode tests
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

React 19 · TypeScript · Vite 8 · Tailwind 4 · Three.js / React Three Fiber / drei · Framer Motion · GSAP (available) · Node 22+ (Windows: Node 24 tested) · Hono · `@modelcontextprotocol/sdk` · zod 4 · Anthropic SDK · OpenAI SDK · `@octokit/rest` · `googleapis` · Remotion · Vitest · Playwright · ESLint 10.

## Live Demo

Demo mode runs **for free, with no API key and no server**: `apps/web` has a browser-only build that replays runs recorded from the real agent + MCP pipeline over synthetic fixtures. The UI code path is the same one a live run uses (same events, same report schema, same source-integrity validation), so what you see is the real product UX, labelled as a demo workspace with sample data (`데모 워크스페이스 · 샘플 데이터`, `기록 재생`). In the demo, tool selection comes from a per-question plan (`scripted-heuristics-v1`), and the UI says so; with `LLM_API_KEY` or `LLM_PROVIDER=claude-cli` (local Claude Code login) on the API server, the model chooses the tools.

```bash
npm run build:demo           # → apps/web/dist-demo (static, deploy anywhere)
npm run preview:demo -w apps/web
```

The four example requests are exactly the prompts that were recorded with the scripted planner; one more run (`실제 LLM 기록`) was recorded with a real model (Claude Code CLI) choosing the tools over the same sample data (`LLM_PROVIDER=claude-cli npm run record:llm-run`). Free-form prompts need the API server. The UI follows the system light/dark setting, with a toggle in the top bar. Each run is addressable (`#/report/<runId>`), its report can be copied as Slack mrkdwn or Markdown (items can be excluded first), and its full event trace (tool inputs, outputs, per-call MCP time) is viewable and downloadable as JSON. Recordings are regenerated from the real servers with `npm run export:portfolio-data` into `packages/shared/demo/`.

## Demo vs Real

| | DEMO (browser-only build) | DEMO (API, default `npm run dev`) | REAL |
| --- | --- | --- | --- |
| Needs | nothing | Node | Node + a read-only GitHub App (or Google OAuth, eCampus login) + Claude Code login or an LLM key |
| Data | synthetic fixtures, recorded | synthetic fixtures, live MCP calls | your GitHub / Gmail / Calendar / eCampus; headless: `MAWA_GITHUB_TOKEN` |
| MCP servers | recorded `tools/list` + `tools/call` | spawned per run, `--mode=demo` | spawned per run, `--mode=real` |
| LLM | none (replay) | scripted, or a real model with `LLM_API_KEY` | scripted, or a real model |
| Network from the page | none | same-origin API only | same-origin API only |

## Demo Mode

`AGENT_MODE=demo` (the default) spawns the MCP servers with `--mode=demo`. They serve clearly synthetic fixtures for the chosen persona (student: four servers; worker at the fictional B사: three, no LMS), with dates on a pinned demo clock so recordings stay stable. Without `LLM_API_KEY`, the `ScriptedProvider` replays a fixed tool plan and builds the report with heuristics; the UI shows `LLM: scripted (no API key)`. With a key, a real model runs over the demo fixtures. The pipeline, transport and UI are identical to Real Mode (ADR-006).

## Real Mode

Real Mode uses only the integrations you have connected through OAuth: the API spawns a server **only** for connected services (GitHub with your token; Gmail and Calendar with your Google token) and skips the rest, so a `real` report never mixes in demo data. `/api/status` reports each integration as `not_configured`, `disconnected` or `connected`, and the UI's Real toggle stays disabled until something is connected. Only read endpoints are ever called. Google scopes are read-only (`gmail.readonly`, `calendar.readonly`). **GitHub is different:** an OAuth App's `repo` scope is read *and* write because GitHub offers no read-only repository scope for OAuth Apps. For least privilege, register a **GitHub App** with read-only permissions and set `GITHUB_OAUTH_SCOPES=""` (see [`docs/SETUP.md`](docs/SETUP.md)). Tokens are exchanged server-side and encrypted at rest with AES-256-GCM. GitHub App user tokens expire after 8 hours; the API keeps the refresh token and renews the token before a run.

What a real run looks like in the browser: with `AGENT_MODE=real` the composer starts in **실제** once a source is connected; the run streams over SSE; a sticky line shows **실제 실행 · 실제 데이터 · <start> · <provider/model>**, computed from the run's own events (`agent_run_started.mode`, `llm_*`) like the mode badge, never from a UI switch and never in the demo build; a failed run is shown as failed, with nothing filled in from samples. `?record=1` (kept for the tab, survives the OAuth round trip) replaces account names with 「내 계정」 for screen recordings; report content is left as it is. The full path is covered by `e2e/web-real.spec.ts` against a fake GitHub (OAuth + REST) and a fake `claude` binary; the parts that need a real account are a checklist in [docs/REAL_RUN.md](docs/REAL_RUN.md).

## Environment Variables

See [`.env.example`](.env.example). Nothing is hard-coded; `.env` is git-ignored.

| Variable | Purpose |
| --- | --- |
| `AGENT_MODE` | `demo` (default) or `real` |
| `LLM_PROVIDER` | `anthropic` (default), `openai`, `openai-compatible`, `claude-cli` (uses the local Claude Code login, no key), `scripted` |
| `LLM_API_KEY`, `LLM_MODEL`, `LLM_BASE_URL` | provider credentials; `LLM_BASE_URL` for OpenAI-compatible endpoints |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth App or GitHub App OAuth credentials |
| `GITHUB_OAUTH_SCOPES` | scopes for an OAuth App (default `read:user repo`); keep the line with an empty value (`GITHUB_OAUTH_SCOPES=`) for a GitHub App |
| `MAWA_GITHUB_TOKEN` | read-only fine-grained token standing in for the GitHub connection on headless machines (`npm run record:web`); deliberately not `GITHUB_TOKEN` |
| `CLAUDE_BIN` | path to `claude.exe` or `cli.js` when Claude Code is not found automatically (Windows: `where.exe` and npm shims are tried first) |
| `GITHUB_OAUTH_URL`, `GITHUB_API_URL` | test only (e2e fake GitHub); https or `http://localhost` only, because tokens are sent there |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client (Web application, redirect `http://localhost:3001/auth/google/callback`); consent screen External in Testing with yourself as test user — see docs/REAL_RUN.md |
| `SESSION_ENCRYPTION_KEY` | 64 hex chars (`openssl rand -hex 32`); without it tokens are memory-only |
| `API_PORT`, `WEB_ORIGIN`, `API_PUBLIC_URL`, `TOKEN_STORE_PATH` | server settings |
| `API_HOST` | interface to bind; `127.0.0.1` by default (run records contain mail and calendar data) |
| `API_ACCESS_TOKEN` | optional shared secret (≥16 chars); when set, `/api/*` and disconnect require it and the UI asks for it once |
| `LMS_BASE_URL` | Moodle LMS for the eCampus MCP server (default `https://lms.chungbuk.ac.kr`); connect in the UI with your own LMS login |
| `RUN_STORE_PATH` | with `SESSION_ENCRYPTION_KEY`, finished runs are kept encrypted here (last 30) so reports can be compared week to week |
| `AUDIT_LOG_PATH`, `AUDIT_SIGNING_KEY_PATH` | hash-chained audit log (JSONL) and its Ed25519 signing key, created on first start (default `.tokens/`) |
| `POLICY_PATH` | server-owned data policy (JSON); a request can only make it stricter |

A `KEY=` line left empty counts as not set (defaults apply); `GITHUB_OAUTH_SCOPES=` is the one exception. `npm run doctor` checks the keys without printing values.

## Setup

```bash
git clone https://github.com/djkdb/mawa.git && cd mawa
npm install
cp .env.example .env     # optional for demo mode
```

OAuth app and LLM configuration for Real Mode: [`docs/SETUP.md`](docs/SETUP.md).

## Running the Project

```bash
npm run doctor     # before a real run: .env keys (no values), build, claude lookup + login, free ports
npm run start:real # build → doctor → API (node, from the build) + web :5173 in one command (works on Windows)
npm run dev        # builds TS packages, then starts api (:3001), web (:5173), portfolio (:5174)
npm run build      # builds every workspace (shared, agent-core, mcp servers, api, web, portfolio; motion typechecks)
npm run test       # vitest: schemas, MCP servers over stdio, agent loop, API, demo client (vitest)
npm run test:e2e   # Playwright: API-backed UI, portfolio, the demo build, and real mode against a fake GitHub + fake claude
npm run lint       # eslint
npm run ask -- "질문"  # ask from the terminal; LLM_PROVIDER=claude-cli lets the model pick the MCP tools (docs/SETUP.md)
npm run audit:verify -- file.jsonl   # verify a hash-chained audit log (web export or gateway --audit)
npm run record:gateway-run           # Claude Code → policy gateway → demo servers, saves answer + audit
npm run record:web -- "질문"          # real mode in a headless browser → recordings/*.mp4 + run metadata (MAWA_GITHUB_TOKEN)
npm run eval                         # score recorded reports against the hand-written gold items
npm run typecheck  # tsc -b + Vite apps
```

## MCP Servers

| Server | Tools | Real provider |
| --- | --- | --- |
| `mcp-servers/github` | `get_recent_commits`, `get_pull_requests`, `get_open_issues`, `get_repository_activity` | GitHub REST via `@octokit/rest`, `GITHUB_TOKEN` (+ `GITHUB_API_URL` for tests); verified against the real API |
| `mcp-servers/gmail` | `search_emails`, `get_email`, `search_project_emails` | Gmail API, `gmail.readonly` |
| `mcp-servers/calendar` | `get_events`, `get_upcoming_events`, `search_events` | Calendar API, `calendar.readonly` |
| `mcp-servers/lms` | eCampus assignments, quizzes, deadlines | CBNU Moodle web-service token from the user's own login (password not stored) |
| `mcp-servers/gateway` | the tools of the servers behind it, filtered by policy | see **Policy Gateway** |

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

`packages/agent-core` exports `runAgent`, `McpToolExecutor`, the `LLMProvider` interface with `AnthropicProvider`, `OpenAIProvider`, `OpenAICompatibleProvider`, `ClaudeCliProvider` (headless `claude -p` with a JSON schema per turn, no tools of its own), `ScriptedProvider`, `aggregateContext`, `generateReport` and a `RunStore` seam (`MemoryRunStore` in v1).

## Frontend

`apps/web` renders the prompt panel, the **agent office** (a pixel office drawn in code: one person per MCP server, the agent walking between desks, the model as an AI core behind a security gate where the policy strips what it masks, lights only in the rooms the run is using — a night-shift ops room in dark mode and a daytime office in light mode; every move is one run event, it keeps up with a live run, and has a replay button and a per-person info card), the `AGENT ACTIVITY` timeline (derived purely from events), the report with `observed` / `inferred` markers and clickable `Source:` chips, and the integrations panel. Desktop-first, responsive to mobile, keyboard-accessible controls, `aria-live` on the timeline.

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
- **The first real run finds what tests don't.** Windows npm shims, an expired CLI login, `KEY=` lines read as empty paths, `tsx watch` not starting the API, a stale dev server holding port 5173 on `::1` only, Hangul smeared by a monospace font with no Korean glyphs, Google's "test users only" block — none showed up until the agent ran on my own PC and account. Each became a fix, a test, a line in `npm run doctor`, or a step in docs/REAL_RUN.md.

## Future Improvements

More MCP servers (Slack, Notion, Jira) behind the same gateway; scheduled weekly runs; write tools gated behind explicit human approval; a model-based PII detector next to the regex one; anchoring the audit chain head outside the server (a transparency log); a larger eval set across more weeks. Already done and no longer on this list: recorded real-model runs, the eval set, per-user tokens and signed audit logs (gateway). See `docs/ARCHITECTURE.md` §8 and `docs/ENTERPRISE.md`.

---

Built by **Lee Seongjun** · Software Engineering, Chungbuk National University · Instagram [@zun_it_](https://www.instagram.com/zun_it_/) · AI × MCP × AX
