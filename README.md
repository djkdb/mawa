# My AI Work Agent

> Connect work. Understand context. Execute with AI.

A personal work agent that connects GitHub, Gmail and Google Calendar through
**real MCP servers**, lets an AI agent pick the tools it needs, aggregates the
context, and produces a source-grounded **Weekly Work Report**.

> **Status: under construction.** Phase 1 (workspace + shared schemas) is done.
> Nothing below this line is runnable as a product yet. See
> [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the design and
> [`docs/DECISIONS.md`](docs/DECISIONS.md) for the decision log.

## What exists today

| Package | What it is |
| --- | --- |
| `packages/shared` | Zod schemas for MCP tool contracts, the Weekly Work Report (with source-integrity validation), agent events (every event requires `mode: demo \| real`), and project metadata. |

## Development

```bash
npm install
npm run typecheck   # tsc -b
npm run build
npm run test        # vitest
npm run lint        # eslint
```

Requires Node 22+. Copy `.env.example` to `.env` when Real Mode lands; never
commit `.env`.
