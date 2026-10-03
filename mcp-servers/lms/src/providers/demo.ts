import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { rebaseDates } from '../rebase-dates.js';
import { AssignmentSchema, CourseSchema, DeadlineSchema, type Assignment, type Course, type Deadline, type LmsProvider } from '../types.js';

const FixtureSchema = z.object({ courses: z.array(CourseSchema), deadlines: z.array(DeadlineSchema), assignments: z.array(AssignmentSchema) });
type Fixture = z.infer<typeof FixtureSchema>;

/** Demo provider: a synthetic semester served through the same tools as the Moodle provider. */
export class DemoLmsProvider implements LmsProvider {
  private fixture: Promise<Fixture>;
  constructor(fixturePath = fileURLToPath(new URL('../../fixtures/lms.json', import.meta.url))) {
    this.fixture = readFile(fixturePath, 'utf8').then((raw) => FixtureSchema.parse(rebaseDates(JSON.parse(raw))));
  }
  async getCourses(): Promise<Course[]> {
    return (await this.fixture).courses;
  }
  async getUpcomingDeadlines({ from, to, limit }: { from: string; to: string; limit: number }): Promise<Deadline[]> {
    return (await this.fixture).deadlines.filter((d) => d.due >= from && d.due < to).sort((a, b) => a.due.localeCompare(b.due)).slice(0, limit);
  }
  async getAssignments({ from, to, courseId, limit }: { from: string; to: string; courseId?: number; limit: number }): Promise<Assignment[]> {
    return (await this.fixture).assignments
      .filter((a) => (courseId === undefined || a.courseId === courseId) && a.due !== null && a.due >= from && a.due < to)
      .sort((a, b) => (a.due ?? '').localeCompare(b.due ?? ''))
      .slice(0, limit);
  }
}
