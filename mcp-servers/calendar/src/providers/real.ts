import { google, type calendar_v3 } from 'googleapis';
import { googleAuthFromEnv } from '../google-auth.js';
import type { CalendarEvent, CalendarProvider } from '../types.js';

/** Real provider over the Google Calendar API with the `calendar.readonly` scope. */
export class RealCalendarProvider implements CalendarProvider {
  private calendar: calendar_v3.Calendar;

  constructor(auth = googleAuthFromEnv()) {
    this.calendar = google.calendar({ version: 'v3', auth });
  }

  async getEvents({ timeMin, timeMax, query, limit }: { timeMin: string; timeMax: string; query?: string; limit: number }): Promise<CalendarEvent[]> {
    const { data } = await this.calendar.events.list({
      calendarId: 'primary',
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: limit,
      ...(query ? { q: query } : {}),
    });
    return (data.items ?? []).flatMap((e) => (e.id ? [toEvent(e)] : []));
  }
}

function toEvent(e: calendar_v3.Schema$Event): CalendarEvent {
  const allDay = Boolean(e.start?.date);
  const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T00:00:00.000Z` : new Date().toISOString());
  const end = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00.000Z` : start);
  return {
    sourceId: `calendar:event:${e.id}`,
    eventId: e.id ?? '',
    calendar: 'primary',
    title: e.summary ?? '(no title)',
    description: e.description ?? null,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    allDay,
    location: e.location ?? null,
    attendees: (e.attendees ?? []).map((a) => a.email ?? '').filter(Boolean),
    organizer: e.organizer?.email ?? null,
    status: (e.status as CalendarEvent['status']) ?? 'confirmed',
    url: e.htmlLink ?? null,
  };
}
