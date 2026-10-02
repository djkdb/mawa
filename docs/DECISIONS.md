# Decision Log

Architecture Decision Records for My AI Work Agent. Newest at the bottom.

---

## ADR-001 — Monorepo layout: drop `apps/agent` and `packages/ui`

**Context.** The brief proposed `apps/{web,agent,api}`, `packages/{shared,agent-core,ui}`.

**Decision.** Keep `apps/web`, `apps/api`, `packages/shared`, `packages/agent-core`,
`mcp-servers/*`, `portfolio`, `motion`, `docs`. Drop `apps/agent` and `packages/ui`.

**Why.** The agent is a library (`agent-core`) hosted by the API process; a
separate runnable `apps/agent` would duplicate the API's MCP client wiring. A
shared UI package is only worth it with multiple consumers; `web` and
`portfolio` deliberately have different visual systems (product UI vs. pitch
deck), so they share Tailwind config and tokens, not components.

**Consequence.** Fewer packages to build and link; less "architecture theatre".
Revisit if a CLI runner for the agent becomes useful.

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

**Decision.** `LLMProvider` interface; implementations for Anthropic, OpenAI,
OpenAI-compatible base URLs, and `ScriptedProvider`. Chosen by `LLM_PROVIDER`.

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
