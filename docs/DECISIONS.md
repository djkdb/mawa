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

