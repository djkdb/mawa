import { z } from 'zod';
import { AgentModeSchema } from '../mode.js';
import { SourceSchema } from './source.js';

/**
 * `observed` — the statement is directly supported by cited sources.
 * `inferred` — the statement is the model's interpretation or extrapolation.
 *
 * An `observed` item MUST cite at least one source. An `inferred` item MAY cite
 * sources it reasoned from, but is still presented to the user as a guess.
 */
export const ConfidenceSchema = z.enum(['observed', 'inferred']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ReportItemSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    confidence: ConfidenceSchema,
    /** Ids of `Source`s in `WeeklyWorkReport.sources`. Validated for existence. */
    sources: z.array(z.string().min(1)).default([]),
  })
  .refine((item) => item.confidence !== 'observed' || item.sources.length > 0, {
    message: 'An "observed" report item must cite at least one source.',
    path: ['sources'],
  });
export type ReportItem = z.infer<typeof ReportItemSchema>;

export const ReportSectionIdSchema = z.enum([
  'overview',
  'major_activities',
  'project_progress',
  'schedule',
  'relevant_emails',
  'potential_risks',
  'next_actions',
]);
export type ReportSectionId = z.infer<typeof ReportSectionIdSchema>;

export const ReportSectionSchema = z.object({
  id: ReportSectionIdSchema,
  title: z.string().min(1),
  items: z.array(ReportItemSchema),
});
export type ReportSection = z.infer<typeof ReportSectionSchema>;

/** The seven sections, in display order. */
export const REPORT_SECTION_ORDER: readonly ReportSectionId[] = [
  'overview',
  'major_activities',
  'project_progress',
  'schedule',
  'relevant_emails',
  'potential_risks',
  'next_actions',
] as const;

export const REPORT_SECTION_TITLES: Record<ReportSectionId, string> = {
  overview: 'Overview',
  major_activities: 'Major Activities',
  project_progress: 'Project Progress',
  schedule: 'Schedule',
  relevant_emails: 'Relevant Emails',
  potential_risks: 'Potential Risks',
  next_actions: 'Next Actions',
};

const WeeklyWorkReportBaseSchema = z.object({
  runId: z.string().min(1),
  mode: AgentModeSchema,
  generatedAt: z.iso.datetime(),
  period: z.object({
    start: z.iso.datetime(),
    end: z.iso.datetime(),
  }),
  title: z.string().min(1).default('Weekly Work Report'),
  /** Every Source that any item may cite. The single source of truth for ids. */
  sources: z.array(SourceSchema),
  sections: z.array(ReportSectionSchema),
});

/**
 * Weekly Work Report with referential integrity:
 *  - every `ReportItem.sources[]` id must exist in `report.sources`
 *  - source ids must be unique
 *  - section ids must be unique
 */
export const WeeklyWorkReportSchema = WeeklyWorkReportBaseSchema.superRefine((report, ctx) => {
  const sourceIds = new Set<string>();
  report.sources.forEach((source, i) => {
    if (sourceIds.has(source.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate source id "${source.id}".`,
        path: ['sources', i, 'id'],
      });
    }
    sourceIds.add(source.id);
  });

  const sectionIds = new Set<string>();
  report.sections.forEach((section, s) => {
    if (sectionIds.has(section.id)) {
      ctx.addIssue({
        code: 'custom',
        message: `Duplicate section id "${section.id}".`,
        path: ['sections', s, 'id'],
      });
    }
    sectionIds.add(section.id);

    section.items.forEach((item, i) => {
      item.sources.forEach((ref, r) => {
        if (!sourceIds.has(ref)) {
          ctx.addIssue({
            code: 'custom',
            message: `Report item "${item.id}" cites unknown source id "${ref}".`,
            path: ['sections', s, 'items', i, 'sources', r],
          });
        }
      });
    });
  });
});
export type WeeklyWorkReport = z.infer<typeof WeeklyWorkReportSchema>;
export type WeeklyWorkReportInput = z.input<typeof WeeklyWorkReportSchema>;

/** Convenience: collect every unresolved source reference without throwing. */
export function findDanglingSourceRefs(report: WeeklyWorkReportInput): string[] {
  const known = new Set(report.sources.map((s) => s.id));
  const dangling = new Set<string>();
  for (const section of report.sections) {
    for (const item of section.items) {
      for (const ref of item.sources ?? []) {
        if (!known.has(ref)) dangling.add(ref);
      }
    }
  }
  return [...dangling];
}
