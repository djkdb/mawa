import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { AgentEvent, McpServerId } from '@mawa/shared';
import { summaryKo } from '../lib/copy.js';

/**
 * The agent's run as a pixel office. Every MCP server is a person at a desk (GitHub, 메일, 일정,
 * eCampus), the agent is my assistant walking between them, the model is a robot in the AI room
 * and the data policy is a guard at its door. Nothing here is decorative state: every move comes
 * from one run event (tool_call_started → walk to that desk, llm_request → the guard masks, …),
 * queued with a minimum duration so a fast replay stays readable. All art is drawn in code.
 */

// ---------------------------------------------------------------- geometry (logical pixels)
const W = 320;
const H = 184;
const CORRIDOR = 92;
type Spot = { x: number; y: number };
type RoomId = McpServerId | 'agent' | 'ai';
const ROOMS: Record<RoomId, { x: number; y: number; w: number; h: number; door: number; label: string; floor: [string, string] }> = {
  github: { x: 4, y: 16, w: 100, h: 64, door: 54, label: 'GitHub 개발실', floor: ['#c9b8f0', '#bba7ea'] },
  gmail: { x: 110, y: 16, w: 100, h: 64, door: 160, label: '메일실', floor: ['#f6c9cf', '#f0b8c0'] },
  calendar: { x: 216, y: 16, w: 100, h: 64, door: 266, label: '일정실', floor: ['#bfe8df', '#ade0d5'] },
  lms: { x: 4, y: 104, w: 100, h: 76, door: 54, label: 'eCampus 자료실', floor: ['#dbe9b5', '#cfe0a1'] },
  agent: { x: 110, y: 104, w: 100, h: 76, door: 160, label: '내 자리', floor: ['#e8d9bd', '#dfcda9'] },
  ai: { x: 216, y: 104, w: 100, h: 76, door: 266, label: 'AI 회의실', floor: ['#cdd6ee', '#bfcae6'] },
};
/** Where the visiting assistant stands in each room, and where the room's person sits. */
const VISIT: Record<RoomId, Spot> = {
  github: { x: 70, y: 76 }, gmail: { x: 176, y: 76 }, calendar: { x: 282, y: 76 },
  lms: { x: 72, y: 166 }, agent: { x: 150, y: 146 }, ai: { x: 252, y: 150 },
};
const SEAT: Record<McpServerId, Spot> = { github: { x: 48, y: 36 }, gmail: { x: 154, y: 36 }, calendar: { x: 260, y: 36 }, lms: { x: 48, y: 124 } };
const GUARD_POST: Spot = { x: 284, y: CORRIDOR + 2 };
const ROBOT_POST: Spot = { x: 280, y: 132 };

// ---------------------------------------------------------------- sprites
// 12×16. K outline/eyes, S skin, H hair, C shirt, D shirt shade, P trousers, B shoes, W white, A accent.
const BODY = [
  '....HHHH....',
  '...HHHHHH...',
  '..HHSSSSHH..',
  '..HSKSSKSH..',
  '...SSSSSS...',
  '....SSSS....',
  '..CCCCCCCC..',
  '.SCCDCCDCCS.',
  '.SCCCCCCCCS.',
  '.S.CCCCCC.S.',
  '...CCCCCC...',
  '...PPPPPP...',
];
const LEGS = [
  ['...PP..PP...', '...PP..PP...', '...BB..BB...', '............'],
  ['...PP...PP..', '..PP....PP..', '..BB.....BB.', '............'],
  ['..PP...PP...', '..PP....PP..', '.BB.....BB..', '............'],
];
const TYPING = ['..CCCCCCCC..', '.SCCDCCDCCS.', 'SSCCCCCCCCSS', '...CCCCCC...'];
const ROBOT = [
  '.....AA.....',
  '.....KK.....',
  '..MMMMMMMM..',
  '..MEEMMEEM..',
  '..MEEMMEEM..',
  '..MMKKKKMM..',
  '...MMMMMM...',
  '..CCCCCCCC..',
  '.MCCAACCCCM.',
  '.MCCAACCCCM.',
  '.M.CCCCCC.M.',
  '...CCCCCC...',
  '...MM..MM...',
  '...MM..MM...',
  '...KK..KK...',
  '............',
];
type Look = { hair: string; shirt: string; shade: string; trousers: string; cap?: string };
const LOOK: Record<string, Look> = {
  agent: { hair: '#3b2a20', shirt: '#2563eb', shade: '#1e40af', trousers: '#334155' },
  github: { hair: '#1f1f2e', shirt: '#6366f1', shade: '#4338ca', trousers: '#27272a' },
  gmail: { hair: '#7c2d12', shirt: '#e11d48', shade: '#9f1239', trousers: '#3f3f46' },
  calendar: { hair: '#111827', shirt: '#0d9488', shade: '#115e59', trousers: '#374151' },
  lms: { hair: '#a16207', shirt: '#65a30d', shade: '#3f6212', trousers: '#44403c' },
  guard: { hair: '#111827', shirt: '#1e3a8a', shade: '#172554', trousers: '#1f2937', cap: '#0f172a' },
};
const SKIN = '#f2c79b';

function drawMap(g: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, x: number, y: number) {
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const c = pal[row[i]!];
      if (c) { g.fillStyle = c; g.fillRect(x + i, y + j, 1, 1); }
    }
  });
}
function drawPerson(g: CanvasRenderingContext2D, who: string, x: number, y: number, pose: 'stand' | 'walk1' | 'walk2' | 'type', t: number) {
  const L = LOOK[who] ?? LOOK['agent']!;
  const pal: Record<string, string> = { K: '#1b1b24', S: SKIN, H: L.hair, C: L.shirt, D: L.shade, P: L.trousers, B: '#1b1b24', W: '#ffffff' };
  const bob = pose === 'walk1' || pose === 'walk2' ? (pose === 'walk1' ? 0 : -1) : 0;
  const ox = Math.round(x - 6);
  const oy = Math.round(y - 16 + bob);
  // shadow
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(ox + 2, Math.round(y) - 1, 8, 2);
  const body = pose === 'type' && Math.floor(t / 180) % 2 === 0 ? [...BODY.slice(0, 6), ...TYPING, ...BODY.slice(10)] : BODY;
  drawMap(g, body, pal, ox, oy);
  drawMap(g, LEGS[pose === 'walk1' ? 1 : pose === 'walk2' ? 2 : 0]!, pal, ox, oy + 12);
  if (L.cap) { g.fillStyle = L.cap; g.fillRect(ox + 3, oy, 6, 2); g.fillRect(ox + 2, oy + 2, 9, 1); g.fillStyle = '#facc15'; g.fillRect(ox + 5, oy + 7, 1, 1); }
}
function drawRobot(g: CanvasRenderingContext2D, x: number, y: number, t: number, thinking: boolean) {
  const glow = thinking ? (Math.floor(t / 220) % 2 ? '#a78bfa' : '#f0abfc') : '#7dd3fc';
  drawMap(g, ROBOT, { K: '#1b1b24', M: '#cbd5e1', E: glow, A: thinking ? '#f472b6' : '#94a3b8', C: '#7c3aed' }, Math.round(x - 6), Math.round(y - 16 + (thinking ? (Math.floor(t / 300) % 2) : 0)));
}

// ---------------------------------------------------------------- static scene
function drawScene(g: CanvasRenderingContext2D, active: Set<RoomId>, present: Set<McpServerId>, t: number, printed: number, papers: number) {
  g.fillStyle = '#5b4636';
  g.fillRect(0, 0, W, H);
  // top wall: windows with sky, lamps
  for (let x = 20; x < W; x += 52) { g.fillStyle = '#3a2c22'; g.fillRect(x, 2, 22, 11); g.fillStyle = '#93c5fd'; g.fillRect(x + 1, 3, 20, 9); g.fillStyle = '#dbeafe'; g.fillRect(x + 3, 4, 6, 2); g.fillStyle = '#3a2c22'; g.fillRect(x + 11, 3, 1, 9); }
  // corridor: wood planks
  for (let x = 0; x < W; x += 16) for (let y = CORRIDOR - 12; y < CORRIDOR + 12; y += 6) { g.fillStyle = ((x / 16 + y / 6) | 0) % 2 ? '#b98a5e' : '#ad7f55'; g.fillRect(x, y, 16, 6); }
  for (const [id, r] of Object.entries(ROOMS) as Array<[RoomId, (typeof ROOMS)[RoomId]]>) {
    const off = id !== 'agent' && id !== 'ai' && !present.has(id);
    for (let x = r.x; x < r.x + r.w; x += 8) for (let y = r.y; y < r.y + r.h; y += 8) { g.fillStyle = ((x - r.x) / 8 + (y - r.y) / 8) % 2 ? r.floor[0] : r.floor[1]; g.fillRect(x, y, 8, 8); }
    // back wall
    g.fillStyle = '#f4ead8'; g.fillRect(r.x, r.y, r.w, 10);
    g.fillStyle = '#d8c7a8'; g.fillRect(r.x, r.y + 10, r.w, 2);
    // outline + door gap
    g.fillStyle = '#3a2c22';
    g.fillRect(r.x - 1, r.y - 1, r.w + 2, 1); g.fillRect(r.x - 1, r.y, 1, r.h); g.fillRect(r.x + r.w, r.y, 1, r.h);
    const doorY = r.y < CORRIDOR ? r.y + r.h : r.y - 1;
    g.fillRect(r.x - 1, doorY, r.door - 9 - (r.x - 1), 1); g.fillRect(r.door + 9, doorY, r.x + r.w + 1 - (r.door + 9), 1);
    if (active.has(id)) { g.fillStyle = 'rgba(255,240,150,0.18)'; g.fillRect(r.x, r.y, r.w, r.h); }
    if (off) { g.fillStyle = 'rgba(40,30,25,0.45)'; g.fillRect(r.x, r.y, r.w, r.h); }
  }
  const desk = (x: number, y: number, w = 28) => { g.fillStyle = '#7a4e2d'; g.fillRect(x, y, w, 9); g.fillStyle = '#9a6a3f'; g.fillRect(x, y, w, 3); g.fillStyle = '#5c3a21'; g.fillRect(x + 1, y + 9, 2, 4); g.fillRect(x + w - 3, y + 9, 2, 4); };
  const monitor = (x: number, y: number, on: boolean, tint: string) => { g.fillStyle = '#1f2937'; g.fillRect(x, y, 12, 9); g.fillStyle = on ? tint : '#334155'; g.fillRect(x + 1, y + 1, 10, 6); if (on) { g.fillStyle = 'rgba(255,255,255,0.75)'; for (let i = 0; i < 3; i++) g.fillRect(x + 2, y + 2 + i * 2, 2 + ((Math.floor(t / 160) + i * 3) % 7), 1); } g.fillStyle = '#111827'; g.fillRect(x + 5, y + 9, 2, 2); };
  const plant = (x: number, y: number) => { g.fillStyle = '#b45309'; g.fillRect(x, y + 6, 6, 5); g.fillStyle = '#16a34a'; g.fillRect(x + 1, y, 4, 6); g.fillRect(x - 1, y + 2, 2, 3); g.fillRect(x + 5, y + 1, 2, 3); g.fillStyle = '#22c55e'; g.fillRect(x + 2, y + 1, 2, 2); };
  const shelf = (x: number, y: number, w = 22) => { g.fillStyle = '#6b4226'; g.fillRect(x, y, w, 20); g.fillStyle = '#4a2c17'; g.fillRect(x, y + 9, w, 1); const c = ['#ef4444', '#3b82f6', '#eab308', '#10b981', '#a855f7', '#f97316']; for (let i = 0; i < w - 3; i += 3) { g.fillStyle = c[(i / 3) % c.length]!; g.fillRect(x + 1 + i, y + 2, 2, 7); g.fillStyle = c[(i / 3 + 2) % c.length]!; g.fillRect(x + 1 + i, y + 11, 2, 8); } };

  // GitHub room: two monitors, bookshelf, plant
  shelf(78, 18); plant(10, 20);
  monitor(44, 38, active.has('github'), '#4f46e5'); monitor(58, 38, active.has('github'), '#0f172a');
  // Gmail room: pigeonholes + red mailbox + envelopes
  g.fillStyle = '#8b5a3c'; g.fillRect(184, 18, 22, 16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { g.fillStyle = '#5c3a21'; g.fillRect(185 + i * 5, 19 + j * 5, 4, 4); if ((i + j) % 2 === 0) { g.fillStyle = '#ffffff'; g.fillRect(185 + i * 5, 21 + j * 5, 4, 2); } }
  g.fillStyle = '#dc2626'; g.fillRect(116, 22, 9, 12); g.fillStyle = '#7f1d1d'; g.fillRect(117, 25, 7, 1);
  monitor(150, 38, active.has('gmail'), '#e11d48');
  // Calendar room: wall calendar + clock
  g.fillStyle = '#ffffff'; g.fillRect(286, 17, 22, 18); g.fillStyle = '#0d9488'; g.fillRect(286, 17, 22, 4);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) { g.fillStyle = i === 2 && j === 1 ? '#ef4444' : '#94a3b8'; g.fillRect(288 + i * 4, 23 + j * 4, 2, 2); }
  g.fillStyle = '#f8fafc'; g.fillRect(222, 18, 9, 9); g.fillStyle = '#1f2937'; g.fillRect(226, 20, 1, 3); g.fillRect(226, 22, 3, 1);
  monitor(256, 38, active.has('calendar'), '#0d9488'); plant(300, 60);
  // eCampus: shelves + lamp
  shelf(8, 106, 26); shelf(70, 106, 30);
  g.fillStyle = '#fde68a'; g.fillRect(36, 116, 6, 3); g.fillStyle = '#78716c'; g.fillRect(38, 119, 1, 6);
  monitor(44, 126, active.has('lms'), '#65a30d');
  // My desk: monitor, paper tray, printer, rug
  g.fillStyle = '#c2410c'; g.fillRect(124, 150, 52, 22); g.fillStyle = '#ea580c'; g.fillRect(127, 153, 46, 16);
  desk(136, 132, 34); monitor(146, 124, true, '#2563eb');
  g.fillStyle = '#f8fafc'; for (let i = 0; i < Math.min(papers, 8); i++) g.fillRect(162, 130 - i, 7, 1);
  g.fillStyle = '#cbd5e1'; g.fillRect(186, 126, 18, 12); g.fillStyle = '#64748b'; g.fillRect(186, 126, 18, 3); g.fillStyle = '#1f2937'; g.fillRect(189, 131, 12, 1);
  if (printed > 0) { g.fillStyle = '#ffffff'; g.fillRect(190, 132 - Math.min(printed, 8), 10, Math.min(printed, 8)); g.fillStyle = '#94a3b8'; g.fillRect(191, 133 - Math.min(printed, 8), 6, 1); }
  plant(114, 160);
  // AI room: whiteboard + round table + sofa
  g.fillStyle = '#f8fafc'; g.fillRect(236, 106, 40, 18); g.fillStyle = '#94a3b8'; g.fillRect(236, 124, 40, 1);
  if (active.has('ai')) { g.fillStyle = '#7c3aed'; for (let i = 0; i < 4; i++) g.fillRect(239, 109 + i * 4, 6 + ((Math.floor(t / 200) + i * 5) % 26), 1); }
  g.fillStyle = '#6d28d9'; g.fillRect(222, 160, 22, 8); g.fillStyle = '#7c3aed'; g.fillRect(222, 156, 22, 5);
  g.fillStyle = '#9a6a3f'; g.beginPath(); g.ellipse(286, 156, 13, 6, 0, 0, Math.PI * 2); g.fill();
  plant(304, 108);
  // desks drawn in front of seated people are done in drawFront()
}
function drawFront(g: CanvasRenderingContext2D) {
  const desk = (x: number, y: number, w = 28) => { g.fillStyle = '#7a4e2d'; g.fillRect(x, y, w, 9); g.fillStyle = '#9a6a3f'; g.fillRect(x, y, w, 3); g.fillStyle = '#5c3a21'; g.fillRect(x + 1, y + 9, 2, 4); g.fillRect(x + w - 3, y + 9, 2, 4); };
  desk(38, 46, 36); desk(142, 46, 28); desk(248, 46, 28); desk(36, 134, 28);
}

// ---------------------------------------------------------------- director: events → actions
type Bubble = { text: string; tone?: 'ok' | 'warn' | 'bad' | 'think' };
type Say = Partial<Record<Actor, Bubble | null>>;
type Action = { ms: number; walkTo?: RoomId; carry?: number; active?: RoomId[]; say?: Say; print?: number; status?: string };
type Actor = 'agent' | McpServerId | 'guard' | 'ai';
const SHORT: Record<string, string> = {
  get_recent_commits: '커밋 조회', get_pull_requests: 'PR 조회', get_open_issues: '이슈 조회', get_repository_activity: '저장소 활동',
  search_emails: '메일 검색', get_email: '메일 본문', search_project_emails: '프로젝트 메일',
  get_events: '이번 주 일정', get_upcoming_events: '다가오는 일정', search_events: '일정 검색',
  get_courses: '수강 과목', get_upcoming_deadlines: '마감 조회', get_assignments: '과제 상태',
};
const toolOf = (n: string) => SHORT[n.split('__').pop() ?? n] ?? n.split('__').pop() ?? n;
const cut = (s: string, n = 34) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function actionsFor(e: AgentEvent): Action[] {
  switch (e.type) {
    case 'agent_run_started': return [{ ms: 1400, walkTo: 'agent', say: { agent: { text: `질문 받음 · ${cut(e.prompt, 24)}` } }, status: '질문을 받았습니다' }];
    case 'mcp_server_connected': return [{ ms: 500, say: { [e.server]: { text: `연결됨 · ${e.serverInfo.name}`, tone: 'ok' } } as Say, status: `${ROOMS[e.server].label} 연결` }];
    case 'tool_discovered': return [{ ms: 700, say: { agent: { text: `도구 ${e.tools.length}개 확인` } }, status: `도구 ${e.tools.length}개를 확인했습니다` }];
    case 'llm_request': {
      const masked = e.maskedEmails + e.maskedPii;
      return [
        { ms: 1100, walkTo: 'ai', active: ['ai'], say: { agent: null, guard: { text: masked ? `보내기 전 가림 ${masked}건` : '정책 확인 · 통과', tone: masked ? 'warn' : 'ok' } }, status: e.phase === 'plan' ? 'AI에게 어떤 도구를 쓸지 묻는 중' : '모은 자료를 AI에게 넘기는 중' },
        { ms: e.phase === 'plan' ? 900 : 1600, active: ['ai'], say: { ai: { text: e.phase === 'plan' ? '어떤 자료가 필요할까…' : '리포트 쓰는 중…', tone: 'think' } } },
      ];
    }
    case 'llm_response': return [{ ms: 1300, active: ['ai'], say: { ai: { text: e.toolCalls.length ? `필요: ${cut(e.toolCalls.map((c) => toolOf(c.name)).join(', '), 30)}` : '자료 충분해요', tone: 'ok' }, guard: null }, status: e.toolCalls.length ? `AI가 도구 ${e.toolCalls.length}개를 골랐습니다` : 'AI가 자료가 충분하다고 했습니다' }];
    case 'tool_call_started': {
      const verify = e.call.id.startsWith('verify_');
      return [{ ms: 1000, walkTo: e.call.server, active: [e.call.server], say: { agent: null, ai: null, [e.call.server]: { text: `${verify ? '누락 검사 · ' : ''}${toolOf(e.call.name)}…` } } as Say, status: `${ROOMS[e.call.server].label}: ${toolOf(e.call.name)}` }];
    }
    case 'tool_call_completed': return [{ ms: 900, carry: 1, active: [e.call.server], say: { [e.call.server]: { text: cut(summaryKo(e.result.output.summary), 26), tone: 'ok' } } as Say }];
    case 'tool_call_failed': return [{ ms: 1200, active: [e.call.server], say: { [e.call.server]: { text: `실패 · ${cut(e.result.error.message, 22)}`, tone: 'bad' } } as Say, status: `${ROOMS[e.call.server].label} 호출 실패` }];
    case 'tool_call_denied': return [{ ms: 1300, say: { guard: { text: `차단 · ${toolOf(e.call.name)}`, tone: 'bad' } }, status: `정책이 ${toolOf(e.call.name)} 호출을 막았습니다` }];
    case 'tool_call_adjusted': return [{ ms: 1000, say: { guard: { text: `범위 줄임 · ${cut(e.changes.join(', '), 20)}`, tone: 'warn' } } }];
    case 'policy_applied': return e.excluded.length || e.blockedTools.length ? [{ ms: 1100, say: { guard: { text: `정책 적용 · 제외 ${e.excluded.length}건`, tone: 'warn' } } }] : [];
    case 'context_aggregated': return [{ ms: 1300, walkTo: 'agent', active: ['agent'], say: { agent: { text: `자료 ${e.totalItems}건 정리` } }, status: `자료 ${e.totalItems}건을 정리했습니다` }];
    case 'report_generated': return [{ ms: 1600, walkTo: 'agent', print: 8, active: ['agent'], say: { ai: { text: '완성!', tone: 'ok' }, agent: { text: `리포트 출력 · 출처 ${e.report.sources.length}건`, tone: 'ok' }, guard: null }, status: '리포트가 나왔습니다' }];
    case 'coverage_checked': return [{ ms: 1300, walkTo: 'agent', say: { agent: { text: e.missed.length ? `누락 검사 · 빠진 것 ${e.missed.length}건` : '누락 검사 · 빠진 것 없음', tone: e.missed.length ? 'warn' : 'ok' } } }];
    case 'agent_run_completed': return [{ ms: 1500, walkTo: 'agent', say: { agent: e.status === 'success' ? { text: '끝! 리포트를 확인하세요', tone: 'ok' } : { text: `실패 · ${cut(e.error ?? '', 24)}`, tone: 'bad' } }, status: e.status === 'success' ? '실행 완료' : '실행 실패' }];
    default: return [];
  }
}

// ---------------------------------------------------------------- component
type Mover = { x: number; y: number; path: Spot[] };

/** What a person in the office is, for the info card: their MCP server and what they did this run. */
function infoOf(a: Actor, events: AgentEvent[]): { title: string; lines: string[] } {
  if (a === 'agent') return { title: '에이전트 · MCP 클라이언트', lines: [`도구 호출 ${events.filter((e) => e.type === 'tool_call_completed').length}회`, '질문을 받아 담당자에게 자료를 받아 오고, AI에게 넘기고, 리포트를 출력합니다.'] };
  if (a === 'ai') {
    const llm = [...events].reverse().find((e) => e.type === 'llm_response' || e.type === 'llm_request');
    return { title: 'AI 모델', lines: [llm && (llm.type === 'llm_request' || llm.type === 'llm_response') ? `${llm.provider}/${llm.model}` : '아직 요청 없음', `요청 ${events.filter((e) => e.type === 'llm_request').length}회 · 받은 자료는 보안 담당을 거친 것뿐`] };
  }
  if (a === 'guard') {
    const reqs = events.filter((e) => e.type === 'llm_request');
    const masked = reqs.reduce((n, e) => n + (e.type === 'llm_request' ? e.maskedEmails + e.maskedPii : 0), 0);
    const denied = events.filter((e) => e.type === 'tool_call_denied').length;
    const excluded = events.flatMap((e) => (e.type === 'policy_applied' ? e.excluded : [])).length;
    return { title: '보안 담당 · 데이터 정책', lines: [`AI에 보내기 전 가림 ${masked}건(요청마다 합산) · 호출 차단 ${denied}건 · 제외 ${excluded}건`, '허용된 도구만 통과시키고, 메일 주소·개인정보를 가립니다.'] };
  }
  const hello = events.find((e) => e.type === 'mcp_server_connected' && e.server === a);
  const tools = events.flatMap((e) => (e.type === 'tool_discovered' ? e.tools.filter((t) => t.server === a) : []));
  const done = events.filter((e) => e.type === 'tool_call_completed' && e.call.server === a);
  const lastDone = done.at(-1);
  return {
    title: `${NAME[a]} · ${hello && hello.type === 'mcp_server_connected' ? `${hello.serverInfo.name} v${hello.serverInfo.version}` : 'MCP 서버'}`,
    lines: [`도구 ${tools.length}개${tools.length ? ` (${tools.map((t) => toolOf(t.name)).join(', ')})` : ''} · 이번 실행 호출 ${done.length}회`, lastDone && lastDone.type === 'tool_call_completed' ? `마지막 결과: ${summaryKo(lastDone.result.output.summary)}` : '이번 실행에서 아직 부르지 않았습니다.'],
  };
}
const ACTORS: Actor[] = ['agent', 'github', 'gmail', 'calendar', 'lms', 'guard', 'ai'];
const NAME: Record<Actor, string> = { agent: '에이전트', github: 'GitHub 담당', gmail: '메일 담당', calendar: '일정 담당', lms: 'eCampus 담당', guard: '보안 담당 · 정책', ai: 'AI 모델' };

function roomAt(p: Spot): RoomId | null {
  for (const [id, r] of Object.entries(ROOMS) as Array<[RoomId, (typeof ROOMS)[RoomId]]>) if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return id;
  return null;
}
function route(from: Spot, to: RoomId): Spot[] {
  const target = VISIT[to];
  const a = roomAt(from);
  if (a === to) return [target];
  const pts: Spot[] = [];
  if (a) pts.push({ x: ROOMS[a].door, y: from.y }, { x: ROOMS[a].door, y: CORRIDOR });
  pts.push({ x: ROOMS[to].door, y: CORRIDOR }, { x: ROOMS[to].door, y: target.y }, target);
  return pts;
}

export function AgentOffice({ events, live, servers }: { events: AgentEvent[]; live: boolean; servers: McpServerId[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const tags = useRef<Partial<Record<Actor, HTMLElement | null>>>({});
  const bubbles = useRef<Partial<Record<Actor, HTMLDivElement | null>>>({});
  const reduced = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [status, setStatus] = useState('질문을 기다리는 중');
  const [playing, setPlaying] = useState(true);
  const [picked, setPicked] = useState<Actor | null>(null);
  const present = useMemo(() => new Set(servers), [servers]);
  // Mutable scene state, advanced by the animation loop.
  const sim = useRef({ queue: [] as Action[], fed: 0, current: null as Action | null, left: 0, agent: { ...VISIT.agent, path: [] } as Mover, say: {} as Partial<Record<Actor, Bubble | null>>, active: new Set<RoomId>(), carry: 0, printed: 0, sources: 0, playing: true });
  const runKey = events.find((e) => e.type === 'agent_run_started')?.runId ?? '';

  // A new run (or none): reset the office.
  useEffect(() => {
    const s = sim.current;
    s.queue = []; s.fed = 0; s.current = null; s.left = 0; s.say = {}; s.active = new Set(); s.carry = 0; s.printed = 0;
    s.agent = { ...VISIT.agent, path: [] };
    s.say.agent = { text: '질문을 기다리는 중' };
    // A finished run that is only being shown (not live): jump to its end state, offer a replay.
    if (!live && events.length) {
      for (const e of events) for (const a of actionsFor(e)) applyInstant(a);
      s.fed = events.length;
      setStatus('지난 실행 · 다시 보기로 재생');
    }
  }, [runKey]);

  function applyInstant(a: Action) {
    const s = sim.current;
    if (a.walkTo) { s.agent = { ...VISIT[a.walkTo], path: [] }; }
    if (a.carry) s.carry += a.carry;
    if (a.print) { s.printed = a.print; s.carry = 0; }
    if (a.say) for (const [k, v] of Object.entries(a.say)) s.say[k as Actor] = v ?? null;
    s.active = new Set(a.active ?? []);
  }

  // Feed new events into the queue as they arrive.
  useEffect(() => {
    const s = sim.current;
    if (events.length < s.fed) s.fed = 0;
    for (const e of events.slice(s.fed)) s.queue.push(...actionsFor(e));
    s.fed = events.length;
  }, [events]);

  const replay = () => {
    const s = sim.current;
    s.queue = events.flatMap(actionsFor); s.current = null; s.left = 0; s.say = {}; s.active = new Set(); s.carry = 0; s.printed = 0;
    s.agent = { ...VISIT.agent, path: [] };
    s.playing = true; setPlaying(true);
  };

  useEffect(() => {
    const g = canvas.current?.getContext('2d');
    if (!g) return;
    g.imageSmoothingEnabled = false;
    let raf = 0;
    let last = performance.now();
    let lastStatus = '';
    const frame = (now: number) => {
      const s = sim.current;
      const dt = Math.min(100, now - last);
      last = now;
      if (s.playing) {
        // Next action: catch up when many are waiting (a replay of a finished run), never skip one.
        const speed = s.queue.length > 24 ? 3 : s.queue.length > 10 ? 2 : 1;
        if (!s.current && s.queue.length) {
          const a = s.queue.shift()!;
          s.current = a; s.left = a.ms;
          if (a.walkTo) s.agent.path = reduced ? [VISIT[a.walkTo]] : route(s.agent, a.walkTo);
          if (a.carry) s.carry += a.carry;
          if (a.print) { s.printed = 0; s.carry = 0; }
          if (a.say) for (const [k, v] of Object.entries(a.say)) s.say[k as Actor] = v ?? null;
          if (a.active) s.active = new Set(a.active);
          if (a.status && a.status !== lastStatus) { lastStatus = a.status; setStatus(a.status); }
        }
        // Walk.
        const step = (reduced ? 999 : 0.07 * speed) * dt;
        let remaining = step;
        while (remaining > 0 && s.agent.path.length) {
          const p = s.agent.path[0]!;
          const dx = p.x - s.agent.x, dy = p.y - s.agent.y;
          const d = Math.hypot(dx, dy);
          if (d <= remaining) { s.agent.x = p.x; s.agent.y = p.y; s.agent.path.shift(); remaining -= d; } else { s.agent.x += (dx / d) * remaining; s.agent.y += (dy / d) * remaining; remaining = 0; }
        }
        if (s.current) {
          if (s.current.print && s.printed < s.current.print) s.printed += dt / 120;
          // An action ends after its time and once the walk is over.
          s.left -= dt * speed;
          if (s.left <= 0 && !s.agent.path.length) s.current = null;
        }
      }

      drawScene(g, s.active, present, now, Math.floor(s.printed), s.carry);
      const busy = (id: McpServerId) => s.active.has(id) && s.say[id]?.text.endsWith('…');
      const seated = (['github', 'gmail', 'calendar', 'lms'] as const).filter((id) => present.has(id));
      for (const id of seated) drawPerson(g, id, SEAT[id].x, SEAT[id].y + 12, busy(id) ? 'type' : 'stand', now);
      drawFront(g);
      drawRobot(g, ROBOT_POST.x, ROBOT_POST.y, now, s.say.ai?.tone === 'think');
      drawPerson(g, 'guard', GUARD_POST.x, GUARD_POST.y, 'stand', now);
      const walking = s.agent.path.length > 0;
      drawPerson(g, 'agent', s.agent.x, s.agent.y, walking ? (Math.floor(now / 140) % 2 ? 'walk1' : 'walk2') : 'stand', now);
      if (s.carry > 0) { g.fillStyle = '#ffffff'; g.fillRect(Math.round(s.agent.x) + 4, Math.round(s.agent.y) - 11, 5, Math.min(1 + s.carry, 5)); g.fillStyle = '#94a3b8'; g.fillRect(Math.round(s.agent.x) + 5, Math.round(s.agent.y) - 10, 3, 1); }

      // HTML overlay: crisp Korean text for names and speech.
      const pos: Record<Actor, Spot> = { agent: { x: s.agent.x, y: s.agent.y }, github: { x: SEAT.github.x, y: SEAT.github.y + 12 }, gmail: { x: SEAT.gmail.x, y: SEAT.gmail.y + 12 }, calendar: { x: SEAT.calendar.x, y: SEAT.calendar.y + 12 }, lms: { x: SEAT.lms.x, y: SEAT.lms.y + 12 }, guard: GUARD_POST, ai: ROBOT_POST };
      for (const a of ACTORS) {
        const p = pos[a];
        const tag = tags.current[a];
        if (tag) { tag.style.left = `${(p.x / W) * 100}%`; tag.style.top = `${((p.y + 1) / H) * 100}%`; }
        const b = bubbles.current[a];
        if (b) {
          const msg = s.say[a];
          const off = a !== 'agent' && a !== 'guard' && a !== 'ai' && !present.has(a);
          b.style.display = msg && !off ? '' : 'none';
          if (msg) {
            if (b.dataset['text'] !== msg.text) { b.dataset['text'] = msg.text; b.textContent = msg.text; }
            b.dataset['tone'] = msg.tone ?? '';
            b.style.left = `${(Math.min(Math.max(p.x, 40), W - 40) / W) * 100}%`;
            b.style.top = `${((p.y - 19) / H) * 100}%`;
          }
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [present, reduced]);

  const toggle = () => { const s = sim.current; s.playing = !s.playing; setPlaying(s.playing); };

  return (
    <section aria-labelledby="office-heading" className="surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="office-heading" className="text-[15px] font-semibold">에이전트 사무실</h2>
          <p className="text-[13px] text-text-3">MCP 서버마다 담당자 한 명. 실행 이벤트 그대로 움직입니다. 이름표를 누르면 담당 정보가 보입니다.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={toggle} aria-label={playing ? '일시정지' : '재생'} className="hairline inline-flex min-h-9 items-center gap-1 rounded-md px-2.5 text-xs text-text-2 hover:text-text">{playing ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{playing ? '일시정지' : '재생'}</button>
          <button type="button" onClick={replay} disabled={live || !events.length} className="hairline inline-flex min-h-9 items-center gap-1 rounded-md px-2.5 text-xs text-text-2 hover:text-text disabled:opacity-40"><RotateCcw className="h-3.5 w-3.5" aria-hidden />다시 보기</button>
        </div>
      </div>
      <div className="relative mt-3 overflow-hidden rounded-lg border border-line" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas ref={canvas} width={W} height={H} role="img" aria-label={`에이전트 사무실 그림. 지금: ${status}`} className="block h-full w-full" style={{ imageRendering: 'pixelated' }} />
        {(Object.keys(ROOMS) as RoomId[]).map((id) => (
          <span key={id} className="pointer-events-none absolute rounded-sm bg-black/45 px-1 text-[10px] leading-4 text-white sm:text-[11px]" style={{ left: `${((ROOMS[id].x + 3) / W) * 100}%`, top: `${((ROOMS[id].y + 1) / H) * 100}%` }}>
            {ROOMS[id].label}{id !== 'agent' && id !== 'ai' && !present.has(id) ? ' · 연결 안 됨' : ''}
          </span>
        ))}
        {ACTORS.map((a) => (
          <div key={a}>
            <button type="button" aria-label={`${NAME[a]} 정보`} aria-pressed={picked === a} onClick={() => setPicked(picked === a ? null : a)} ref={(el) => { tags.current[a] = el; }} className={`absolute -translate-x-1/2 cursor-pointer whitespace-nowrap rounded-sm px-1 text-[9px] font-medium leading-[14px] text-white sm:text-[10px] ${a === 'agent' ? 'bg-blue-700/85' : a === 'ai' ? 'bg-violet-700/85' : a === 'guard' ? 'bg-slate-800/85' : 'bg-black/55'} ${a !== 'agent' && a !== 'guard' && a !== 'ai' && !present.has(a) ? 'hidden' : ''} ${picked === a ? 'ring-2 ring-yellow-300' : ''}`}>{NAME[a]}</button>
            <div aria-hidden ref={(el) => { bubbles.current[a] = el; }} style={{ display: 'none' }} className="office-bubble pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap" />
          </div>
        ))}
      </div>
      {picked && (() => { const i = infoOf(picked, events); return (
        <div role="region" aria-label={`${NAME[picked]} 정보`} className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-[13px]">
          <div className="font-semibold text-text">{i.title}</div>
          {i.lines.map((l) => <div key={l} className="text-text-2">{l}</div>)}
        </div>
      ); })()}
      <p aria-live="polite" className="mt-2 text-[13px] text-text-2"><span className="text-text-3">지금 · </span>{status}</p>
    </section>
  );
}
