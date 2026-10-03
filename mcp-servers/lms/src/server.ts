import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { reply } from './rebase-dates.js';
import { AssignmentSchema, CourseSchema, DeadlineSchema, type LmsProvider } from './types.js';
import { clockNow } from '@mawa/shared';

export const SERVER_NAME = 'mawa-lms';
export const SERVER_VERSION = '0.1.0';
const RO = { readOnlyHint: true, destructiveHint: false, openWorldHint: true } as const;

export function createLmsMcpServer(provider: LmsProvider, mode: 'demo' | 'real'): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const tag = mode === 'demo' ? ' [DEMO DATA]' : '';
  const window = (days: number) => { const now = clockNow(); return { from: new Date(now).toISOString(), to: new Date(now + days * 86_400_000).toISOString() }; };

  server.registerTool(
    'get_courses',
    { title: 'Get courses', annotations: RO, description: `Courses the user is enrolled in on the LMS (Moodle / CBNU eCampus).${tag}`, inputSchema: z.object({}), outputSchema: z.object({ summary: z.string(), data: z.array(CourseSchema) }) },
    async () => {
      const data = await provider.getCourses();
      return reply(`${data.length} courses`, data);
    },
  );

  server.registerTool(
    'get_upcoming_deadlines',
    {
      title: 'Get upcoming deadlines',
      annotations: RO,
      description: `Things due in the LMS in the next N days (assignments to submit, quizzes to take), soonest first. Items already done drop out.${tag}`,
      inputSchema: z.object({ days: z.number().int().min(1).max(60).default(14), limit: z.number().int().min(1).max(50).default(20) }),
      outputSchema: z.object({ summary: z.string(), data: z.array(DeadlineSchema) }),
    },
    async (args) => {
      const data = await provider.getUpcomingDeadlines({ ...window(args.days), limit: args.limit });
      return reply(`${data.length} LMS deadlines in the next ${args.days} days`, data);
    },
  );

  server.registerTool(
    'get_assignments',
    {
      title: 'Get assignments',
      annotations: RO,
      description: `Assignments due in the next N days with my submission status (submitted, draft = saved but not submitted, new = nothing yet).${tag}`,
      inputSchema: z.object({ days: z.number().int().min(1).max(60).default(14), courseId: z.number().int().optional(), limit: z.number().int().min(1).max(30).default(10) }),
      outputSchema: z.object({ summary: z.string(), data: z.array(AssignmentSchema) }),
    },
    async (args) => {
      const data = await provider.getAssignments({ ...window(args.days), ...(args.courseId !== undefined ? { courseId: args.courseId } : {}), limit: args.limit });
      const open = data.filter((a) => a.submission !== 'submitted').length;
      return reply(`${data.length} assignments due, ${open} not submitted`, data);
    },
  );

  return server;
}
