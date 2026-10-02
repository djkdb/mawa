# Implementation Notes — What / Why / How

Each entry answers the three questions for one core feature and points at the code.

## Why MCP instead of calling the APIs directly?

**What.** Each integration is an MCP server (`mcp-servers/*`) using the official SDK; the agent talks to them through an MCP client (`packages/agent-core/src/tools/mcp-executor.ts`).

**Why.** Direct API calls would have been less code, but they couple the agent to every integration: adding a source means editing the agent, and the agent process holds every credential. With MCP the agent discovers capabilities (`tools/list`) and executes them (`tools/call`) without knowing what they do; the server owns the schema, the credential and the API quirks. The same server can be mounted in any MCP host, which is also the honest answer to "is this really MCP?".

**How.** `createGitHubMcpServer(provider, mode)` registers tools with zod input/output schemas. `McpToolExecutor` spawns `node dist/index.js --mode=…` per server over stdio with a filtered environment, caches `tools/list`, and maps `tools/call` results into the shared `ToolResult` type.

## How does the agent choose tools?

**What.** The LLM chooses. The agent passes every discovered tool (namespaced `<server>__<tool>`) as a tool definition and executes whatever the model returns, under a policy.

**Why.** Hard-coding "a weekly report means call these five tools" would be automation, not an agent. Letting the model pick means a request like "what did I promise people over email this week?" naturally skips GitHub.

**How.** `runAgent()` loops: `llm.complete({ system, messages, tools })` → execute returned calls → append results as tool messages → repeat until the model stops or `maxTurns`. `ToolPolicy` enforces `maxToolCalls` (12), `maxTurns` (4), `maxResultChars` and an optional allow-list. In Demo Mode `ScriptedProvider` returns a fixed plan so the pipeline runs without a model.

## How is context aggregated?

**What.** `aggregateContext()` (`packages/agent-core/src/context/aggregate.ts`) turns tool rows into `Source` records and `ContextItem`s.

**Why.** The LLM should reason over a uniform, bounded context, and the validator needs one authoritative list of citable ids.

**How.** Every MCP server emits rows with a namespaced `sourceId`. Rows are normalized by kind (commit, pr, issue, repo, msg, event) into a short summary string (capped at 600 chars), de-duplicated by id across tools, and sorted newest-first. The result's `sources[]` is the only set of ids a report may cite.

## How is hallucination reduced?

**What.** Three mechanisms, in order of strength: a schema the model must fill, a mechanical citation check, and visible confidence labels.

**Why.** Prompt instructions ("only cite real sources") are advisory. The report is consumed by a person making decisions, so unsupported claims must be removed or flagged, not merely discouraged.

**How.** The analysis turn passes a JSON schema (`LLMReportSchema`) via the provider's structured-output option. `generateReport()` then drops every item citing an id absent from `context.sources` (counted as `droppedItems` on the `report_generated` event), downgrades `observed` items with no sources to `inferred`, and finally parses through `WeeklyWorkReportSchema`, whose `superRefine` rejects dangling ids and duplicates. The UI renders `observed` (green) and `inferred` (violet) distinctly with clickable source chips.

## How are data permissions managed?

**What.** OAuth 2.0 authorization-code flow in `apps/api/src/auth/oauth.ts`, read-only Google scopes (GitHub: read-only API usage; OAuth App `repo` scope is read/write, GitHub App permissions can be read-only), an encrypted token store, per-server credential injection.

**Why.** A work agent reads sensitive data. The blast radius has to be limited by design: the browser never holds tokens, the model never sees them, and each MCP server gets only its own.

**How.** `/auth/:provider/start` redirects to the provider with a random `state`; the callback exchanges the code server-side using the client secret from `.env`. Tokens go into `TokenStore` (AES-256-GCM with `SESSION_ENCRYPTION_KEY`, file mode 0600). `RunManager.availableServers('real')` spawns only connected servers, passing `GITHUB_TOKEN` or `GOOGLE_ACCESS_TOKEN`/`GOOGLE_REFRESH_TOKEN` in that child's env. No write scopes exist in v1, so a prompt-injected email cannot cause a write.

## How does Demo Mode stay honest?

**What.** `mode: 'demo' | 'real'` is mandatory on every `AgentEvent` and on `WeeklyWorkReport` (`packages/shared`).

**Why.** A UI flag can be forgotten; a required field cannot be omitted without failing validation.

**How.** The API resolves the mode per run and passes it to `runAgent`, which stamps it on every event. The web client validates each SSE event against `AgentEventSchema` and renders `ModeBadge` from the data. The portfolio's demo slide replays a recorded run whose `mode` is `demo` and says so.

## What goes wrong in a real enterprise environment?

- **Token lifecycle.** Refresh tokens expire or are revoked; the Google adapter refreshes before a run, but a production system needs re-consent flows and alerting.
- **Rate limits and cost.** GitHub search and Gmail list calls are rate-limited; tool budgets help, caching and incremental sync are needed at scale.
- **Prompt injection.** Email bodies and issue text are attacker-controlled. v1 is read-only and treats them as data; any write tool needs human approval and provenance tracking.
- **Data residency and audit.** Every tool call should be logged with who/what/when; the `AgentEvent` stream is the natural audit record, but it is in-memory in v1.
- **Multi-tenancy.** The token store is single-user. Per-user isolation of MCP processes and a policy engine deciding which tools a user may expose to the model are the real AX work.
- **Model variance.** Different providers follow structured-output schemas with different reliability, which is exactly why validation is mechanical.
