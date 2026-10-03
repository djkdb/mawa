import type { McpServerId } from '@mawa/shared';

export type PersonaId = 'student' | 'worker' | 'admin';

/**
 * Who the demo is for. The same agent, servers and controls; a different week, vocabulary and first
 * screen. Student and worker are users with their own synthetic data; the admin is the person who
 * sets the policy and reads the audit for the worker's (fictional) company.
 */
export interface Persona {
  id: PersonaId;
  /** Switcher label. */
  label: string;
  name: string;
  short: string;
  role: string;
  /** Whose recorded data this persona looks at. */
  data: 'student' | 'worker';
  servers: McpServerId[];
  /** Default report on first paint, the real-LLM recording, the gateway recording. */
  defaultRun: string;
  llmRun: string;
  gatewayRun: 'gateway-run' | 'gateway-run-worker';
  /** The same question recorded under three policies. */
  policySet: Array<{ id: string; label: string; hint: string }>;
  /** Category labels by key (keys are what the agent writes). */
  categoryLabel: Record<string, string>;
  /** What the audit page is called for this persona. */
  auditLabel: string;
  intro: string;
  demoNote: string;
}

const STUDENT_CATS = { 과제: '수업·과제', 팀플: '팀플', 개발: '개발', 모임: '모임', 취업: '취업', 공부: '공부', 학사: '학사', 보안: '보안', 기타: '기타' };
const WORKER_CATS = { 과제: '업무·마감', 팀플: '협업·리뷰', 개발: '개발·배포', 모임: '회의', 취업: '채용·커리어', 공부: '학습·세미나', 학사: '인사·행정', 보안: '보안', 기타: '기타' };

export const PERSONAS: Record<PersonaId, Persona> = {
  student: {
    id: 'student', label: '학생', name: '이성준', short: '성준', role: '충북대 소프트웨어학부 · 캡스톤 팀플 · 인턴 준비',
    data: 'student', servers: ['github', 'gmail', 'calendar', 'lms'],
    defaultRun: 'weekly-progress', llmRun: 'llm-run', gatewayRun: 'gateway-run',
    policySet: [
      { id: 'policy-off', label: '정책 없음', hint: '가리기·제외·도구 제한 끔' },
      { id: 'weekly-progress', label: '기본 정책', hint: '가족·광고 메일 제외, 가리기' },
      { id: 'policy-strict', label: '엄격한 정책', hint: '메일 전체 검색·본문 차단, 이름 가명' },
    ],
    categoryLabel: STUDENT_CATS, auditLabel: 'AI가 본 내 데이터',
    intro: '수업·팀플·인턴 준비가 GitHub·Gmail·캘린더·eCampus에 흩어진 한 주',
    demoNote: '성준님의 한 주(수업·팀플·인턴 준비)를 가정한 가상의 샘플 데이터입니다. 실제 계정·메일이 아니며, A사는 가상의 회사입니다.',
  },
  worker: {
    id: 'worker', label: '직장인', name: '정하은', short: '하은', role: '가상의 핀테크 스타트업 B사 · 결제팀 백엔드 3년차',
    data: 'worker', servers: ['github', 'gmail', 'calendar'],
    defaultRun: 'worker-weekly', llmRun: 'llm-run-worker', gatewayRun: 'gateway-run-worker',
    policySet: [
      { id: 'worker-policy-off', label: '정책 없음', hint: '가리기·제외·도구 제한 끔' },
      { id: 'worker-weekly', label: '기본 정책', hint: '가족·광고 메일 제외, 가리기' },
      { id: 'worker-policy-strict', label: '엄격한 정책', hint: '메일 전체 검색·본문 차단, 이름 가명' },
    ],
    categoryLabel: WORKER_CATS, auditLabel: 'AI가 본 내 데이터',
    intro: '코드 리뷰·장애·고객 문의·1:1이 GitHub·Gmail·캘린더에 흩어진 한 주',
    demoNote: '하은님의 한 주(가상의 회사 B사, 결제팀)를 가정한 가상의 샘플 데이터입니다. 실제 회사·계정·메일이 아닙니다.',
  },
  admin: {
    id: 'admin', label: '관리자', name: 'B사 보안 담당자', short: '관리자', role: '가상의 B사 · 구성원의 AI 사용 정책과 감사',
    data: 'worker', servers: ['github', 'gmail', 'calendar'],
    defaultRun: 'worker-policy-strict', llmRun: 'llm-run-worker', gatewayRun: 'gateway-run-worker',
    policySet: [
      { id: 'worker-policy-off', label: '정책 없음', hint: '가리기·제외·도구 제한 끔' },
      { id: 'worker-weekly', label: '기본 정책', hint: '가족·광고 메일 제외, 가리기' },
      { id: 'worker-policy-strict', label: '엄격한 정책', hint: '메일 전체 검색·본문 차단, 이름 가명' },
    ],
    categoryLabel: WORKER_CATS, auditLabel: '감사 로그',
    intro: '구성원이 AI 에이전트에 무엇을 맡겼고, 무엇이 모델로 나갔고, 정책이 무엇을 막았는지',
    demoNote: '가상의 회사 B사 결제팀 구성원(하은)의 실행 기록입니다. 실제 회사·계정·메일이 아닙니다.',
  },
};

const KEY = 'mawa-persona';
let active: PersonaId = (() => {
  try { const v = localStorage.getItem(KEY); return v === 'worker' || v === 'admin' ? v : 'student'; } catch { return 'student'; }
})();

/** The persona the demo is shown as (module-level so labels and copy anywhere follow it). */
export function persona(): Persona { return PERSONAS[active]; }
export function setPersona(id: PersonaId): void {
  active = id;
  try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
}
