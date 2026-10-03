import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { reply } from './rebase-dates.js';
import { CalendarEventSchema, thisWeek, type CalendarProvider } from './types.js';
import { clockNow } from '@mawa/shared';

export const SERVER_NAME = 'mawa-calendar';
export const SERVER_VERSION = '0.1.0';

export function createCalendarMcpServer(provider: CalendarProvider, mode: 'demo' | 'real'): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const tag = mode === 'demo' ? ' [DEMO DATA]' : '';
  const Output = z.object({ summary: z.string(), data: z.array(CalendarEventSchema) });

  server.registerTool(
    'get_events',
    {
      title: 'Get events',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      description: `Events on the primary calendar in a time range. Defaults to the current ISO week (Mon–Sun).${tag}`,
      inputSchema: z.object({
        timeMin: z.iso.datetime().optional(),
        timeMax: z.iso.datetime().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      outputSchema: Output,
    },
    async (args) => {
      const w = thisWeek();
      const data = await provider.getEvents({ timeMin: args.timeMin ?? w.timeMin, timeMax: args.timeMax ?? w.timeMax, limit: args.limit });
      return reply(`${data.length} events`, data);
    },
  );

  server.registerTool(
    'get_upcoming_events',
    {
      title: 'Get upcoming events',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      description: `Events starting from now for the next N days.${tag}`,
      inputSchema: z.object({ days: z.number().int().min(1).max(30).default(7), limit: z.number().int().min(1).max(100).default(20) }),
      outputSchema: Output,
    },
    async (args) => {
      const now = clockNow();
      const data = await provider.getEvents({ timeMin: new Date(now).toISOString(), timeMax: new Date(now + args.days * 86_400_000).toISOString(), limit: args.limit });
      return reply(`${data.length} upcoming events in the next ${args.days} days`, data);
    },
  );

  server.registerTool(
    'search_events',
    {
      title: 'Search events',
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true },
      description: `Free-text search over event title, description and location in a time range (default: ±30 days).${tag}`,
      inputSchema: z.object({
        query: z.string().min(1),
        timeMin: z.iso.datetime().optional(),
        timeMax: z.iso.datetime().optional(),
        limit: z.number().int().min(1).max(100).default(20),
      }),
      outputSchema: Output,
    },
    async (args) => {
      const now = clockNow();
      const data = await provider.getEvents({
        timeMin: args.timeMin ?? new Date(now - 30 * 86_400_000).toISOString(),
        timeMax: args.timeMax ?? new Date(now + 30 * 86_400_000).toISOString(),
        query: args.query,
        limit: args.limit,
      });
      return reply(`${data.length} events matching "${args.query}"`, data);
    },
  );

  return server;
}
