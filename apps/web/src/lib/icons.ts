import { AlertTriangle, BookOpen, Briefcase, CalendarClock, CalendarDays, Code2, FolderGit2, GraduationCap, Lightbulb, ListChecks, Mail, Shapes, ShieldAlert, Sparkles, Users, type LucideIcon } from 'lucide-react';
import type { ReportSectionId } from '@mawa/shared';

/** One icon per report category, used on chips, filters and the home board. */
export const CATEGORY_ICON: Record<string, LucideIcon> = { 과제: BookOpen, 팀플: Users, 개발: Code2, 모임: CalendarClock, 취업: Briefcase, 공부: Lightbulb, 학사: GraduationCap, 보안: ShieldAlert, 기타: Shapes };
export const categoryIcon = (key: string | undefined): LucideIcon => CATEGORY_ICON[key ?? ''] ?? Shapes;

/** Section heading icon and tint. */
export const SECTION_ICON: Record<ReportSectionId, { Icon: LucideIcon; color: string }> = {
  overview: { Icon: Sparkles, color: 'var(--color-accent)' },
  potential_risks: { Icon: AlertTriangle, color: 'var(--color-pri-high)' },
  next_actions: { Icon: ListChecks, color: 'var(--color-ok)' },
  schedule: { Icon: CalendarDays, color: 'var(--color-calendar)' },
  relevant_emails: { Icon: Mail, color: 'var(--color-gmail)' },
  project_progress: { Icon: FolderGit2, color: 'var(--color-github)' },
  major_activities: { Icon: Code2, color: 'var(--color-cat-dev)' },
};
