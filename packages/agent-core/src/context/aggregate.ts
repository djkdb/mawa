import type { McpServerId, Source, SourceType, ToolCall, ToolResult } from '@mawa/shared';

/** A normalized unit of context. One per commit / PR / issue / email / event. */
export interface ContextItem {
  sourceId: string;
  type: SourceType;
  kind: string;
  title: string;
  timestamp?: string;
  url?: string;
  /** Short textual payload shown to the LLM. Size-capped. */
  summary: string;
  raw: Record<string, unknown>;
}

export interface AggregatedContext {
  period: { start: string; end: string };
  sources: Source[];
  items: ContextItem[];
  counts: Partial<Record<McpServerId, number>>;
  toolSummaries: Array<{ tool: string; summary: string }>;
}

const MAX_SUMMARY_CHARS = 600;

/**
 * Turns raw tool results into Sources + ContextItems. Items are identified by
 * `sourceId` (emitted by every MCP server), de-duplicated across tools, and
 * sorted newest-first. The returned `sources` array is the only set of ids a
 * report may cite.
 */
export function aggregateContext(
  results: Array<{ call: ToolCall; result: ToolResult }>,
  period: { start: string; end: string },
): AggregatedContext {
  const items = new Map<string, ContextItem>();
  const toolSummaries: Array<{ tool: string; summary: string }> = [];

  for (const { call, result } of results) {
    if (result.status !== 'ok') continue;
    toolSummaries.push({ tool: `${call.server}.${call.name}`, summary: result.output.summary });
    const data = result.output.data;
    const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
    for (const row of rows) {
      const item = normalize(call, row);
      if (item && !items.has(item.sourceId)) items.set(item.sourceId, item);
    }
  }

  const sorted = [...items.values()].sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''));
  const counts: Partial<Record<McpServerId, number>> = {};
  for (const it of sorted) counts[it.type] = (counts[it.type] ?? 0) + 1;

  return {
    period,
    sources: sorted.map(toSource),
    items: sorted,
    counts,
    toolSummaries,
  };
}

function toSource(item: ContextItem): Source {
  return {
    id: item.sourceId,
    type: item.type,
    title: item.title,
    ...(item.url ? { url: item.url } : {}),
    ...(item.timestamp ? { timestamp: item.timestamp } : {}),
    metadata: { kind: item.kind },
  };
}

function normalize(call: ToolCall, row: unknown): ContextItem | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const sourceId = typeof r['sourceId'] === 'string' ? r['sourceId'] : null;
  if (!sourceId) return null;
  const kind = sourceId.split(':')[1] ?? 'item';
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : undefined);
  const url = str('url');
  const timestamp = str('date') ?? str('start') ?? str('updatedAt') ?? str('lastPushedAt');

  let title: string;
  let summary: string;
  switch (kind) {
    case 'commit':
      title = (str('message') ?? '').split('\n')[0] ?? '';
      summary = `commit ${String(r['sha']).slice(0, 7)} in ${str('repo')}: ${title}`;
      break;
    case 'pr':
      title = str('title') ?? '';
      summary = `PR #${r['number']} (${str('state')}) in ${str('repo')}: ${title}; labels=${JSON.stringify(r['labels'] ?? [])}; reviewComments=${r['reviewComments'] ?? 0}`;
      break;
    case 'issue':
      title = str('title') ?? '';
      summary = `Issue #${r['number']} (${str('state')}) in ${str('repo')}: ${title}; labels=${JSON.stringify(r['labels'] ?? [])}`;
      break;
    case 'repo':
      title = str('repo') ?? '';
      summary = `Repo ${title}: ${r['commitsInPeriod']} commits this period, ${r['openIssues']} open issues, last push ${str('lastPushedAt')}`;
      break;
    case 'msg':
      title = str('subject') ?? '';
      summary = `Email from ${str('from')} on ${str('date')}: "${title}" — ${str('snippet') ?? ''}`;
      break;
    case 'event':
      title = str('title') ?? '';
      summary = `Event "${title}" ${str('start')} → ${str('end')}${str('location') ? ` @ ${str('location')}` : ''}${str('description') ? `: ${str('description')}` : ''}`;
      break;
    default:
      title = str('title') ?? str('name') ?? sourceId;
      summary = JSON.stringify(r);
  }

  return {
    sourceId,
    type: call.server,
    kind,
    title,
    ...(timestamp ? { timestamp } : {}),
    ...(url ? { url } : {}),
    summary: summary.slice(0, MAX_SUMMARY_CHARS),
    raw: r,
  };
}
