import { z } from 'zod';

/** A course the user is enrolled in. */
export const CourseSchema = z.object({
  sourceId: z.string(),
  courseId: z.number().int(),
  shortName: z.string(),
  title: z.string(),
  url: z.url().nullable(),
});
export type Course = z.infer<typeof CourseSchema>;

/** Something due in the LMS (Moodle "action event"): an assignment to submit, a quiz to take. */
export const DeadlineSchema = z.object({
  sourceId: z.string(),
  eventId: z.number().int(),
  course: z.string(),
  courseId: z.number().int(),
  title: z.string(),
  /** Moodle module: assign, quiz, … */
  module: z.string(),
  due: z.iso.datetime(),
  /** What the LMS asks for, e.g. "과제 제출", "퀴즈 응시". */
  action: z.string().nullable(),
  url: z.url().nullable(),
});
export type Deadline = z.infer<typeof DeadlineSchema>;

/** An assignment and where my submission stands. */
export const AssignmentSchema = z.object({
  sourceId: z.string(),
  assignmentId: z.number().int(),
  course: z.string(),
  courseId: z.number().int(),
  title: z.string(),
  due: z.iso.datetime().nullable(),
  /** submitted | draft (saved, not submitted) | new (nothing yet) | unknown */
  submission: z.enum(['submitted', 'draft', 'new', 'unknown']),
  url: z.url().nullable(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

export interface LmsProvider {
  getCourses(): Promise<Course[]>;
  getUpcomingDeadlines(input: { from: string; to: string; limit: number }): Promise<Deadline[]>;
  getAssignments(input: { from: string; to: string; courseId?: number; limit: number }): Promise<Assignment[]>;
}
