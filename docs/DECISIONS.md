# Decision Log

Architecture Decision Records for My AI Work Agent. Newest at the bottom.

---

## ADR-001 — Repository layout and v1 scope

**Context.** The brief proposed `apps/{web,agent,api}` and `packages/{shared,agent-core,ui}`.
Confirmed with the project owner on 2026-10-02.

**Decision.**

- Remove `apps/agent`: the agent is the `packages/agent-core` library and is
  hosted by `apps/api`. There is one process that owns the MCP clients.
- Remove `packages/ui`: `apps/web` (product UI) and `portfolio` (pitch deck)
  have deliberately different visual systems and share only data types and
  project metadata through `packages/shared`.
- `portfolio` is a separate Vite app, fully independent from `apps/web`, so the
  Three.js / R3F / GSAP bundle never weighs on the agent UI.
- No database in v1. Runs are in-memory behind a `RunStore` interface (ADR-004).

Final layout:

```
apps/{api,web}  mcp-servers/{github,gmail,calendar}
packages/{shared,agent-core}  portfolio/  motion/  docs/
```

**Consequence.** Fewer packages to build and link. `packages/shared` is the
only cross-app contract and is therefore built first (Phase 1).

---

## ADR-002 — Use real MCP (official SDK, stdio) instead of direct API calls

**Context.** The simplest implementation would call GitHub/Google APIs directly
from the agent. The brief forbids calling something MCP that is not MCP.

**Decision.** Each integration is a standalone MCP server built on
`@modelcontextprotocol/sdk`, spawned by the API over stdio. The agent discovers
tools with `tools/list` and calls them with `tools/call`.

**Why.** (1) Honesty: the portfolio claims MCP, so the code must be MCP.
(2) Tool discovery at runtime means adding Slack/Notion later touches no agent
code. (3) The same servers can be attached to Claude Desktop or any MCP host,
which demonstrates the real value of the protocol. (4) Credential isolation:
each server process gets only its own token.

**Trade-off.** Extra process boundary and serialization. Acceptable for a
report that runs a dozen tool calls.

---

## ADR-003 — LLM provider abstraction with a scripted provider for Demo Mode

**Decision.** `LLMProvider` interface in `agent-core`; implementations for
Anthropic (default, `LLM_PROVIDER=anthropic`), OpenAI, OpenAI-compatible base
URLs, and `ScriptedProvider`. `agent-core` imports no vendor SDK directly; each
provider is a thin adapter.

**Why.** The brief requires swappable providers. The scripted provider lets the
full pipeline (including real MCP calls to demo-mode servers) run with no API
key, which is what makes `npm run dev` work on a fresh clone. It also makes
agent-core unit-testable without network.

---

## ADR-004 — No database in v1

**Decision.** Runs are kept in memory behind a `RunStore` interface. OAuth
tokens are stored in an encrypted JSON file. SQLite is the first upgrade path.

**Why.** The brief says not to add more DB than needed. Nothing in the weekly
report flow needs history to work. The interface keeps the door open.

---

## ADR-005 — Hallucination control: source-grounded report schema

**Decision.** Every report bullet carries `sources[]` (ids of context items)
and `confidence: observed | inferred`. The agent rejects bullets citing unknown
ids and re-prompts once; after that it drops them and records a warning in the
activity log.

**Why.** The brief requires a visible distinction between data-backed and
AI-inferred content. Enforcing it in the schema, not just the prompt, makes the
guarantee mechanical and testable.

---

## ADR-006 — Demo Mode is a mode of the real pipeline, not a separate UI path

**Decision.** Demo Mode swaps *data sources* (MCP servers in `--mode=demo`,
`ScriptedProvider`) but keeps the agent loop, MCP transport, SSE stream, and UI
identical. A `mode` field travels in every event and in the report metadata.

**Why.** A separate "fake" UI path would drift from the real one and would
tempt dishonest presentation. Keeping one pipeline means the demo proves the
architecture, and the badge cannot be forgotten because it is data-driven.

---

## ADR-007 — Tooling: npm workspaces, Vite 8, Tailwind 4, Vitest, ESLint flat config

**Decision.** npm workspaces (no turborepo/nx at this size). TypeScript strict
project references. Vite for `web` and `portfolio`; `tsx` for dev of Node
packages; `tsc` for build. Vitest for unit tests, Playwright for a smoke test
of the demo run. Remotion for `motion`.

**Why.** Node 22 is available; everything above has current releases that
support it. Avoids task-runner complexity until build times demand it.

---

## ADR-008 — Source integrity is enforced in the shared schema, not only in the agent

**Decision.** `WeeklyWorkReportSchema` (in `packages/shared`) carries a
`superRefine` that rejects any `ReportItem.sources[]` id absent from
`report.sources`, rejects duplicate source ids, and requires every `observed`
item to cite at least one source. `AgentEvent.report_generated` embeds this
schema, so an invalid report cannot even be emitted as an event.

**Why.** Putting the rule in the shared contract means every consumer (API,
UI, tests, future CLI) gets the same guarantee, and the agent cannot bypass it
by constructing the report by hand. `mode` is likewise required on every event
and on the report (ADR-006) so the DEMO MODE badge is data-driven.

---

## ADR-009 — ScriptedProvider is a labelled stand-in, never presented as a model

**Decision.** `ScriptedProvider` (id `scripted`) returns a fixed tool plan and
builds the report with heuristics from the aggregated context. `/api/status`
exposes `llm.isModel: false`, the UI prints "scripted (no API key)", and the
portfolio's demo replay states the provider.

**Why.** Demo Mode must run on a fresh clone with no key, and the brief
forbids presenting unimplemented capability as implemented. A visible,
deterministic stand-in is more honest than a hidden canned response.

---

## ADR-010 — Portfolio data is generated from the running servers

**Decision.** `scripts/export-portfolio-data.mjs` spawns the three MCP servers,
records `tools/list` plus a sample `tools/call` per tool, runs the full agent in
demo mode, and writes both snapshots into `portfolio/src/data/`. The slides
display the generation date and say they are snapshots.

**Why.** Hand-written tool descriptions would drift from the code. Generating
them keeps the portfolio's technical claims identical to the implementation,
and makes the "Live demo" slide an honest replay rather than a mock-up.

---

## ADR-011 — Real Mode only spawns connected servers

**Decision.** A `real` run includes an MCP server only when its OAuth
connection exists; others are skipped and listed in the run's warnings. A run
with nothing connected is refused.

**Why.** Mixing demo fixtures into a report labelled `real` would be exactly
the kind of fake claim the project rules out. Partial real data, clearly
scoped, is better than blended data.

---

## ADR-012 — GitHub least privilege: document the scope gap, support GitHub Apps

**Context.** GitHub OAuth Apps cannot request a read-only repository scope;
`repo` grants write access even though this project only reads. Earlier docs
said "read-only scopes", which was true for Google and false for GitHub.

**Decision.** Keep the OAuth App flow (default scopes `read:user repo`) for a
quick start, add `GITHUB_OAUTH_SCOPES` so a GitHub App (whose user tokens carry
the app's read-only permissions) can be used with the same code path, and
state the difference between "read-only API usage" and "read-only OAuth scope"
in README, SETUP, ARCHITECTURE and the UI.

**Why.** Honesty over convenience; the GitHub App path is the real
least-privilege answer and costs one env var in this architecture.

---

## ADR-013 — The MCP wire is part of the event trace

**Context.** The UI showed tool steps, but nothing in it proved there was an
MCP connection underneath; a viewer could not tell it from a function call.

**Decision.** `McpToolExecutor` wraps the SDK's stdio transport in a tap that
reports every JSON-RPC message in both directions, and reports each server's
`initialize` result. `runAgent` re-emits them as `mcp_server_connected` and
`mcp_message` events. Message bodies are recorded with long strings and arrays
shortened (so they stay valid JSON); sizes are the real byte counts. Tokens
never appear: they are passed to server processes as env, not over the wire.
The demo recordings and the tool catalog are generated with one executor per
run, like apps/api, so every recording contains the handshake.

**Why.** "MCP" should be inspectable, not asserted: the topology view, the
message log and the connections page are all drawn from these events.

---

## ADR-014 — Guard the LLM payload and show it; record a validation demo

**Context.** A five-persona review (hiring engineer, developer, team lead,
security engineer, first-time mobile user) found that the trust story was
asserted, not visible: nothing showed what reached the model, the validator
never had anything to drop, and the API listened on all interfaces with no
cross-origin protection.

**Decision.**
- Before any LLM request, third-party data is masked (personal email
  addresses → `m***@domain`, role accounts kept), made tag-safe (`<`/`>`
  escaped inside the context block) and screened for instruction-like text;
  each request is reported as an `llm_request` event (size, contents, fields,
  masked count, flagged items) and each planning answer as `llm_response`.
- The API binds to `127.0.0.1` by default (`API_HOST`), refuses cross-origin
  state changes and run reads, revokes the grant at the provider on
  disconnect, and no longer reflects error text into redirect URLs.
- Tools declare `readOnlyHint`; reports carry a one-line `reason` per
  priority; the scripted writer merges mails/events that reference the same
  `#N`, detects mail-vs-calendar date conflicts, and leaves personal mail out.
- The demo ships a fourth recording, clearly labelled as fault injection,
  in which a citation to a source that was never fetched is dropped and an
  unsourced "observed" claim is downgraded. A synthetic prompt-injection mail
  in the fixtures shows the flagging path.

**Why.** For a governance-minded reader the evidence has to be on screen and
exportable (JSONL audit), and every claim must hold in real mode too, since
all of it is computed from the same events.

---

## ADR-015 — A student's week as the demo, and a user-defined data policy

**Context.** The author is a software student; a generic "team weekly report"
demo was neither something he would use nor a strong story for a data-access
governance audience.

**Decision.** The demo fixtures describe a fictional week of a CBNU software
student (classes and deadlines, a capstone team repo, internship coding test at
a fictional company, Baekjoon study, a family mail, an ad, an injection-like
bot mail). The scripted writer gains `deadlines` and `career` intents, D-day
ordering from events and from dates written in mail, "my review" detection,
and area tags (수업/팀플/취업/공부/학사). A `DataPolicy` (allowed tools,
exclusion phrases, masking) is accepted by the API per run, applied before
anything reaches the LLM or the context, and reported as `policy_applied`.
The demo shows the policy its recordings ran under, read-only.

**Why.** Real use first (it is the author's own week), and the policy makes the
governance story concrete: the user decides what the agent may read and send,
and every run proves what happened.

---

## ADR-016 — eCampus (CBNU Moodle LMS) as a fourth MCP server

**Context.** Coursework deadlines live in the university LMS, not in mail or
the calendar. CBNU's eCampus is Moodle; its public config
(`tool_mobile_get_public_config`) reports `enablewebservices: 1` and
`enablemobilewebservice: 1`, i.e. the official mobile web service is on.

**Decision.** `mcp-servers/lms` exposes three read-only tools
(`get_courses`, `get_upcoming_deadlines`, `get_assignments`) over the same
Moodle REST functions the mobile app uses, with the user's own token sent in
the POST body. The API's `/auth/lms/connect` exchanges the user's LMS
id/password once at `/login/token.php?service=moodle_mobile_app`; only the
token is stored (encrypted when `SESSION_ENCRYPTION_KEY` is set). Demo mode
serves a synthetic semester. The report merges LMS deadlines with same-day
calendar/mail deadlines, carries submission status, and flags LMS deadlines
missing from the calendar.

**Not verified.** The real provider is tested against a fake Moodle only; it
has not run against eCampus with a real account (no credentials in the build
environment). Users should check the university's IT usage rules.


## ADR-017 — Claude Code CLI as an LLM provider

**Decision.** `LLM_PROVIDER=claude-cli` runs each LLM request as one headless
`claude -p` call (`--tools ""`, `--no-session-persistence`, `--json-schema`,
empty temp cwd). Planning turns get the MCP tool list in the prompt and return
`{text, toolCalls}`; the agent — not the CLI — executes the calls over MCP, so
the data policy, masking, injection flags, citation validation and the audit
trail apply exactly as with the API providers. The analysis turn returns the
report JSON against the same schema.

**Why.** Lets a student run the real model loop with their existing Claude Code
login instead of an API key in this app. Verified on the sample workspace: the
model chose LMS, calendar and mail tools on its own, found the mail-only
scholarship deadline, the mail-vs-calendar presentation-date conflict and
flagged the injected meeting-bot mail (dropped citations: 0).

**Trade-offs.** ≈25–60 s per run (two to three CLI start-ups); the model id is
known only after the first response (`modelUsage`).

## ADR-018 — Policy enforced at the call boundary, PII masking, a pinned demo clock

**Decision.**
- Tools outside `allowedTools` are removed from the list the model sees **and** refused at
  call time (`tool_call_denied`): the request never reaches the MCP server and the model is
  told it was refused. A model that guesses a hidden tool name cannot read through it.
- LLM payloads mask phone numbers (010-****-****, 043-****-****) and 학번 next to the word
  학번, in addition to email addresses (`maskPhones`, default on). Bare long numbers are left
  alone (ids, timestamps). The user's own UI still shows their data unmasked.
- An audit log page builds one row per read / refusal / exclusion / LLM payload from run
  events, across runs, with a JSONL export. The demo ships a policy comparison: the same
  question recorded with no policy and with a strict one (a planner that also requests the
  blocked `gmail.get_email`, labelled as such).
- Demo runs use a pinned clock (`DEMO_NOW`, 2026-10-03 12:00 KST, advancing with the wall
  clock for durations). The MCP client passes it to demo servers as `MAWA_NOW`; the analysis
  payload carries `today`. Before this, recordings made after midnight shifted every
  fixture date by a day against the fixed dates written in the sample mail.

**Why.** Access control that only filters a list is a convention, not a control; the boundary
is where a gateway enforces it. Phone numbers and student numbers are the PII a student's
mail actually contains.

## ADR-019 — The policy layer as an MCP gateway, a hash-chained audit, broader PII detection

**Decision.**
- `mcp-servers/gateway` is an MCP server that is also an MCP client of the four servers. It
  applies the same data policy as `runAgent` (allow-list at `tools/list` and `tools/call`,
  exclusions, masking, instruction screening) to whatever client connects, and appends every
  call to a JSONL audit file whose lines carry `seq`, `prev` and a SHA-256 `hash` over the
  canonical entry. On restart it continues the chain from the last line.
- The same chain code (`@mawa/shared` `audit-chain`, WebCrypto) runs in the browser: the web
  audit page verifies its log, shows an edited copy failing at the edited line, verifies an
  uploaded file, and exports chained JSONL; `npm run audit:verify` checks files from either.
- `maskPii` replaces the phone-only masking: phone, 학번 (next to the word), 주민등록번호
  (date-shaped, hyphen required), account numbers (after 계좌/입금), card numbers (4-4-4-4,
  Luhn). Counts per kind are recorded (`piiKinds`). When the policy masks PII, report source
  previews are masked on screen too.
- A recorded run of Claude Code (headless) through the gateway is shipped
  (`npm run record:gateway-run`): its answer was written from masked results and the gateway's
  audit names the client `claude-code`.

**Why.** A policy inside one agent controls that agent only; a gateway controls the path to the
data. A log that can be edited silently is a diary, not an audit. **Limits:** see
docs/ENTERPRISE.md (no user identity, the chain head is not anchored externally, regex DLP).

## ADR-020 — Stored audit chain, server-owned policy, remote gateway users, pseudonyms

**Decision.**
- The API appends each finished run's audit rows to a hash-chained file (`ChainedAuditLog`,
  `AUDIT_LOG_PATH`, default `.tokens/audit.jsonl`) and serves it with a whole-file check at
  `/api/audit`. The web page shows and verifies those stored lines; it no longer builds a
  chain from events at view time (which would verify anything). The demo ships the chain
  written at recording time.
- The API's base policy comes from `POLICY_PATH`; `tightenPolicy` lets a request add
  exclusions, drop tools or switch masking on, and answers 403 with what it tried to loosen.
- The gateway has a Streamable HTTP mode with per-user Bearer tokens (SHA-256 stored), one
  session per user, per-user policies that can only tighten, and the user on every audit line.
- `pseudonymize`: names from mail senders/organizers become 사람A… in everything sent to the
  model; report items are restored. GitHub logins stay (they are inside citable source ids).

**Why.** Each answers a question a reviewer would ask of the previous version: "what stops
someone re-chaining edited events", "what stops the client turning masking off", "who is the
user", "do names go to the model".

## ADR-021 — Personas: student, worker, admin

**Decision.** The demo is shown as one of three personas. Student and worker are users with
their own synthetic week (`fixtures/<persona>/` per MCP server, selected by `MAWA_PERSONA`,
which the MCP client sets in demo mode); the admin is the policy owner of the worker's fictional
company and lands on the security summary, policy comparison and gateway record. Category keys
stay the same for the agent; their labels follow the persona. The worker's runs (4 examples,
three policies, a real-LLM run, a gateway run) are recorded like the student's.

**Why.** Data control is not a company-only concern dressed up for a student: a student's mail
holds their 주민등록번호 and friends' numbers; a worker's holds customers'. Showing the same
controls from the user's side and the policy owner's side makes that concrete without
pretending a student needs RBAC.

## ADR-022 — Argument limits, a signed chain, an omission check and an eval set

**Decision.**
- `limits` in the data policy: `maxDays`, `maxResults`, `repos`, `senderDomains`. Calls are clamped
  (`tool_call_adjusted`) or refused (`tool_call_denied`, reason `arguments`, e.g. a `*` mailbox
  query); rows outside the repositories/domains are dropped. Same code in the agent and gateway.
- Audit lines carry an Ed25519 signature of their hash (`sig`); the API keeps its key next to the
  token store, the gateway takes `--signing-key`, the demo signs with a key that exists only
  during the export. `verifyChain(…, publicKey)` rejects a chain rewritten without the key.
- After the report, an omission check reads upcoming events, eCampus deadlines and mail with a
  date next to a deadline word (through the same policy, never sent to the model) and emits
  `coverage_checked` with the dated items the report neither cites nor names.
- `eval-gold.json` lists hand-written gold items for four questions; `npm run eval` scores the
  scripted and real-LLM recordings (report found / with the check), shown in the web demo.

**Why.** "Which tool" is not access control without "how much of it". A hash chain without a key
proves nothing to someone who can rewrite the file. A model's report is only as useful as what it
does not miss, and that has to be measured, not asserted.

## ADR-023 — 녹화용 실제 실행 표시는 실행 이벤트로, 가짜 GitHub로 real 경로를 e2e

- **결정**: 「실제 실행 · 실제 데이터 · 시작 시각 · provider/model」 한 줄은 UI 스위치가 아니라 그 실행의 `agent_run_started.mode`(모든 이벤트가 real일 때)와 `llm_*` 이벤트 값으로만 그린다. 데모 빌드에서는 컴포넌트가 아무것도 그리지 않는다. 계정 식별자는 `?record=1`일 때 `/api/status`를 받는 한 곳에서 「내 계정」으로 바꾼다.
- **e2e**: 계정 없이 real 경로를 타도록 GitHub의 OAuth·REST 주소를 바꿀 수 있게 했다(`GITHUB_OAUTH_URL`/`GITHUB_API_URL`, https 또는 localhost http만 허용 — 토큰이 그 주소로 가기 때문). 가짜 GitHub(`e2e/fakes/fake-github.mjs`)와 가짜 `claude`(`CLAUDE_BIN`)로 연결 → 콜백 → 실제 GitHub MCP 서버 → claude-cli 공급자 → 리포트까지 확인한다. 가짜가 만든 문구에는 모두 `[가짜]`가 붙는다.
- **GitHub App 토큰**: 8시간 만료 + refresh token을 저장하고 실행 전에 갱신한다. scope는 설정(`config.github.scopes`)에서만 읽는다.
- **한계**: 실제 GitHub App 승인 화면과 실제 Claude 로그인은 e2e로 확인할 수 없다 → `docs/REAL_RUN.md` 체크리스트.
