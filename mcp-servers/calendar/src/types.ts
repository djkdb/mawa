import { z } from 'zod';
import { clockNow } from '@mawa/shared';

export const CalendarEventSchema = z.object({
  sourceId: z.string(),
  eventId: z.string(),
  calendar: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  start: z.iso.datetime(),
  end: z.iso.datetime(),
  allDay: z.boolean(),
  location: z.string().nullable(),
  attendees: z.array(z.string()),
  organizer: z.string().nullable(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']),
  url: z.url().nullable(),
});
export type CalendarEvent = z.infer<typeof CalendarEventSchema>;

export interface CalendarProvider {
  getEvents(input: { timeMin: string; timeMax: string; query?: string; limit: number }): Promise<CalendarEvent[]>;
}

export function thisWeek(): { timeMin: string; timeMax: string } {
  const now = new Date(clockNow());
  const day = (now.getUTCDay() + 6) % 7; // Monday = 0
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);
  return { timeMin: monday.toISOString(), timeMax: nextMonday.toISOString() };
}
