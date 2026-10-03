import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { rebaseDates } from '../rebase-dates.js';
import { CalendarEventSchema, type CalendarEvent, type CalendarProvider } from '../types.js';

const FixtureSchema = z.object({ events: z.array(CalendarEventSchema) });

export class DemoCalendarProvider implements CalendarProvider {
  private events: Promise<CalendarEvent[]>;

  constructor(fixturePath = fixtureFor('calendar')) {
    this.events = readFile(fixturePath, 'utf8').then((raw) => FixtureSchema.parse(rebaseDates(JSON.parse(raw))).events);
  }

  async getEvents({ timeMin, timeMax, query, limit }: { timeMin: string; timeMax: string; query?: string; limit: number }): Promise<CalendarEvent[]> {
    const q = query?.toLowerCase();
    return (await this.events)
      .filter((e) => e.start < timeMax && e.end > timeMin)
      .filter((e) => !q || `${e.title} ${e.description ?? ''} ${e.location ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => a.start.localeCompare(b.start))
      .slice(0, limit);
  }
}

/** The demo persona's fixture (MAWA_PERSONA, set by the MCP client): fixtures/<persona>/calendar.json, else the default (student) week. */
function fixtureFor(name: string): string {
  const persona = process.env['MAWA_PERSONA'];
  if (persona && /^[a-z]+$/.test(persona)) {
    const p = fileURLToPath(new URL(`../../fixtures/${persona}/${name}.json`, import.meta.url));
    if (existsSync(p)) return p;
  }
  return fileURLToPath(new URL(`../../fixtures/${name}.json`, import.meta.url));
}
