import type { Assignment, Course, Deadline, LmsProvider } from '../types.js';

/**
 * Moodle web-service provider (CBNU eCampus runs Moodle with the mobile web service enabled).
 * Uses the same REST API as the official mobile app, with the user's own token:
 *   core_webservice_get_site_info, core_enrol_get_users_courses,
 *   core_calendar_get_action_events_by_timesort, mod_assign_get_assignments, mod_assign_get_submission_status.
 * Read-only: no function that writes is ever called.
 */
export class MoodleLmsProvider implements LmsProvider {
  private userId: Promise<number> | null = null;

  constructor(
    private readonly baseUrl = process.env['LMS_BASE_URL'] ?? 'https://lms.chungbuk.ac.kr',
    private readonly token = process.env['LMS_TOKEN'] ?? '',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!this.token) throw new Error('LMS_TOKEN is required in real mode (connect eCampus in the app, or get a token from /login/token.php)');
  }

  /** POST so the token never lands in a URL or an access log. */
  private async call<T>(fn: string, params: Record<string, string | number> = {}): Promise<T> {
    const body = new URLSearchParams({ wstoken: this.token, wsfunction: fn, moodlewsrestformat: 'json' });
    for (const [k, v] of Object.entries(params)) body.set(k, String(v));
    const res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}/webservice/rest/server.php`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) throw new Error(`${fn}: HTTP ${res.status}`);
    const json = (await res.json()) as T & { exception?: string; errorcode?: string; message?: string };
    if (json && typeof json === 'object' && 'exception' in json && json.exception) throw new Error(`${fn}: ${json.errorcode ?? json.exception} ${json.message ?? ''}`.trim());
    return json;
  }

  private me(): Promise<number> {
    this.userId ??= this.call<{ userid: number }>('core_webservice_get_site_info').then((r) => r.userid);
    return this.userId;
  }

  private link(path: string) {
    return `${this.baseUrl.replace(/\/$/, '')}${path}`;
  }

  async getCourses(): Promise<Course[]> {
    const courses = await this.call<Array<{ id: number; shortname: string; fullname: string }>>('core_enrol_get_users_courses', { userid: await this.me() });
    return courses.map((c) => ({ sourceId: `lms:course:${c.id}`, courseId: c.id, shortName: c.shortname, title: c.fullname, url: this.link(`/course/view.php?id=${c.id}`) }));
  }

  async getUpcomingDeadlines({ from, to, limit }: { from: string; to: string; limit: number }): Promise<Deadline[]> {
    const r = await this.call<{ events: Array<{ id: number; name: string; modulename?: string; timesort: number; course?: { id: number; fullname: string }; action?: { name?: string; url?: string }; url?: string }> }>(
      'core_calendar_get_action_events_by_timesort',
      { timesortfrom: Math.floor(Date.parse(from) / 1000), timesortto: Math.floor(Date.parse(to) / 1000), limitnum: limit },
    );
    return (r.events ?? []).map((e) => ({
      sourceId: `lms:due:${e.id}`,
      eventId: e.id,
      course: e.course?.fullname ?? '',
      courseId: e.course?.id ?? 0,
      title: e.name,
      module: e.modulename ?? 'event',
      due: new Date(e.timesort * 1000).toISOString(),
      action: e.action?.name ?? null,
      url: e.action?.url ?? e.url ?? null,
    }));
  }

  async getAssignments({ from, to, courseId, limit }: { from: string; to: string; courseId?: number; limit: number }): Promise<Assignment[]> {
    const params: Record<string, string | number> = {};
    if (courseId !== undefined) params['courseids[0]'] = courseId;
    const r = await this.call<{ courses: Array<{ id: number; fullname: string; assignments: Array<{ id: number; cmid: number; name: string; duedate: number }> }> }>('mod_assign_get_assignments', params);
    const lo = Date.parse(from) / 1000, hi = Date.parse(to) / 1000;
    const due = r.courses.flatMap((c) => c.assignments.filter((a) => a.duedate >= lo && a.duedate < hi).map((a) => ({ c, a }))).sort((x, y) => x.a.duedate - y.a.duedate).slice(0, limit);
    const out: Assignment[] = [];
    for (const { c, a } of due) {
      let submission: Assignment['submission'] = 'unknown';
      try {
        const s = await this.call<{ lastattempt?: { submission?: { status?: string } } }>('mod_assign_get_submission_status', { assignid: a.id });
        const st = s.lastattempt?.submission?.status;
        submission = st === 'submitted' ? 'submitted' : st === 'draft' ? 'draft' : st === 'new' || st === undefined ? 'new' : 'unknown';
      } catch { /* status is optional; keep the assignment */ }
      out.push({ sourceId: `lms:assign:${a.id}`, assignmentId: a.id, course: c.fullname, courseId: c.id, title: a.name, due: a.duedate ? new Date(a.duedate * 1000).toISOString() : null, submission, url: this.link(`/mod/assign/view.php?id=${a.cmid}`) });
    }
    return out;
  }
}

/**
 * Exchange the user's LMS id/password for a mobile web-service token (the same call the official app makes).
 * The password is used once and never stored; only the token is kept, encrypted, by the API.
 */
export async function moodleToken(baseUrl: string, username: string, password: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const body = new URLSearchParams({ username, password, service: 'moodle_mobile_app' });
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/login/token.php`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  const json = (await res.json()) as { token?: string; error?: string; errorcode?: string };
  if (!json.token) throw new Error(json.errorcode === 'invalidlogin' ? 'eCampus 아이디 또는 비밀번호가 맞지 않습니다.' : `eCampus 토큰 발급 실패: ${json.errorcode ?? json.error ?? res.status}`);
  return json.token;
}
