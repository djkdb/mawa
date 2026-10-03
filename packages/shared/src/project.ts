/**
 * Project metadata shared by the agent UI (`apps/web`) and the portfolio.
 * Single source of truth so both apps describe the same system.
 */
export const PROJECT = {
  name: 'MY AI WORK AGENT',
  tagline: ['Connect work.', 'Understand context.', 'Execute with AI.'],
  descriptionKo:
    '흩어진 업무 데이터를 연결하고, AI Agent가 업무 맥락을 이해해 실행 가능한 결과를 만들어주는 개인 업무 Agent',
  author: {
    name: 'Lee Seongjun',
    affiliation: 'Software Engineering Student, Chungbuk National University',
    instagram: { handle: '@zun_it_', url: 'https://www.instagram.com/zun_it_/' },
    github: 'https://github.com/djkdb/mawa',
  },
  integrations: ['github', 'gmail', 'calendar', 'lms'] as const,
  pipeline: [
    'USER',
    'AI AGENT',
    'MCP CLIENT',
    'MCP SERVERS',
    'EXTERNAL SERVICES',
    'CONTEXT AGGREGATION',
    'AI ANALYSIS',
    'ACTIONABLE REPORT',
  ] as const,
  /** Sample prompt used across UI, portfolio and motion. */
  samplePrompt: '이번 주 공부·개발이랑 팀플 진행 상황 정리해줘.',
} as const;
