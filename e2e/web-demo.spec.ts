import { expect, test, type Page } from '@playwright/test';

const DEMO = 'http://localhost:4175/';
const CHIP = /^(PR #|이슈 #|커밋 |메일 · |일정 · )/;

async function collect(page: Page) {
  const errors: string[] = [];
  const api: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { const u = r.url(); if (/\/api\/|\/auth\/|\/events/.test(u) || /github\.com|googleapis|anthropic|openai/.test(u)) api.push(u); });
  return { errors, api };
}

test('dashboard explains itself, shows risks/actions/deadlines, and replays a run with a visible trace', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.goto(DEMO);
  await expect(page.getByText('GitHub·Gmail·Google Calendar·eCampus를 읽고 출처가 달린 리포트를 써 주는 AI 업무 에이전트입니다.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /성준님, 이번 주/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '카테고리별 이번 주' })).toBeVisible();
  for (const c of ['수업·과제', '팀플', '개발', '모임', '취업']) await expect(page.getByRole('region', { name: c, exact: true })).toBeVisible();
  await expect(page.locator('.pri-high').first()).toBeVisible();
  await expect(page.getByText(/^(D-\d+|내일|오늘)$/).first()).toBeVisible();

  // Keyboard radio group: one tab stop, arrows select.
  const radios = page.getByRole('radiogroup', { name: '질문 선택' }).getByRole('radio');
  await radios.first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(radios.nth(3)).toHaveAttribute('aria-checked', 'true');
  await expect(radios.nth(3)).toBeFocused();

  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.locator('#activity-heading')).toBeFocused();
  await expect(page.getByText(/도구 \d+회 호출 \(GitHub, Gmail, Calendar, eCampus\) · 출처 \d+건 · MCP 호출 합계 \d+ms/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('도구 선택: 질문별 실행 계획(스크립트)', { exact: false })).toBeVisible();

  // Tool call details: inputs, result, duration; raw events.
  await page.getByRole('button', { name: '단계 보기' }).click();
  await expect(page.getByText('요청 수신')).toBeVisible();
  await page.getByRole('button', { name: /GitHub · 열린 이슈 확인/ }).click();
  await expect(page.getByText('stdio', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/ms \(기록 당시 MCP 호출 시간\)/).first()).toBeVisible();
  await page.getByRole('button', { name: /원시 이벤트 \d+개/ }).click();
  await expect(page.getByRole('table', { name: '에이전트 이벤트 트레이스' })).toContainText('tool_call_completed');

  // The "missed or stuck" run has its own report and no "커밋 0개".
  await expect(page.getByRole('region', { name: '팀플', exact: true })).toContainText('PR #8');
  expect(await page.getByText(/커밋 0개/).count()).toBe(0);

  expect(api, 'no API / external calls in demo mode').toEqual([]);
  expect(errors).toEqual([]);
});

test('report: deep link survives reload, copy for Slack, hide items, demo sources have no fake links', async ({ page, context }) => {
  const { errors, api } = await collect(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${DEMO}#/report/recorded_blockers`);
  await expect(page.getByRole('heading', { level: 2, name: '놓친 것·막힌 것' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: '놓친 것·막힌 것' })).toBeVisible();
  await expect(page).toHaveTitle('리포트 · My AI Work Agent');

  // Hide one item, then copy: the hidden item is excluded.
  await page.getByRole('button', { name: '복사할 항목 고르기' }).click();
  const firstItem = page.locator('#report [data-report-item]').first();
  const hiddenText = (await firstItem.locator('.item-text').innerText()).split('\n')[0]!.replace(/^(높음|보통|낮음)/, '').slice(0, 20);
  await firstItem.getByRole('button', { name: '복사할 때 이 항목 빼기' }).click();
  await expect(page.getByRole('button', { name: /숨긴 항목 1개 되돌리기/ })).toBeVisible();
  await page.getByRole('button', { name: /짧게 복사/ }).click();
  await expect(page.locator('#report').getByText(/짧은 공유용 형식으로 복사했습니다 \(숨긴 항목 1개 제외\)/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '짧은 공유용 형식으로 복사했습니다' })).toHaveCount(1);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('*놓친 것·막힌 것*');
  expect(clip).toContain('•');
  expect(clip).not.toContain(hiddenText);

  // Citation popover in demo mode: no "원본 열기" link to a fake URL.
  await page.getByRole('button', { name: CHIP }).first().click();
  const dialog = page.getByRole('dialog', { name: '출처' });
  await expect(dialog).toContainText('샘플 데이터 · 원본 없음');
  expect(await dialog.getByRole('link').count()).toBe(0);
  await page.keyboard.press('Escape');

  // Run history opens a specific run by URL.
  await page.getByRole('link', { name: '실행 기록' }).first().click();
  await expect(page.getByRole('table')).toContainText('샘플 기록');
  // The real-LLM recording is listed and labelled with its model.
  await expect(page.getByRole('table')).toContainText(/실제 LLM 기록 · \S+/);
  await page.getByRole('link', { name: '마감 순서', exact: true }).click();
  await expect(page).toHaveURL(/#\/report\/recorded_deadlines$/);
  await expect(page.getByRole('heading', { level: 2, name: '마감 순서' })).toBeVisible();

  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});

test('help dialog traps focus and closes with Escape; honest about scripted tool selection', async ({ page }) => {
  const { errors } = await collect(page);
  await page.goto(DEMO);
  const trigger = page.getByRole('button', { name: '작동 방식 보기' });
  await trigger.click();
  const dlg = page.getByRole('dialog', { name: '작동 방식' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByRole('button', { name: '닫기' })).toBeFocused();
  await expect(dlg).toContainText('질문별로 정해 둔 실행 계획');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  await expect(trigger).toBeFocused();
  expect(errors).toEqual([]);
});

test('phone layout: bottom tabs, no horizontal overflow, popover inside the viewport', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(DEMO);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.locator('#activity').getByText(/도구 \d+회 호출/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: '리포트' }).last().click();
  await page.getByRole('button', { name: CHIP }).first().click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});

test('weekly report renders sections visually from source metadata (chart, PR states, timeline, inbox)', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.goto(`${DEMO}#/report/recorded_weekly-progress`);
  const report = page.locator('#report');
  await expect(report.getByRole('img', { name: /^요일별 활동:/ })).toBeVisible();
  await expect(report.getByText('저장소별 커밋')).toBeVisible();
  await expect(report.getByText('병합됨').first()).toBeVisible();
  await expect(report.getByText('리뷰 코멘트 3').first()).toBeVisible();
  await expect(report.getByText(/^\d{2}:\d{2}–\d{2}:\d{2}$/).first()).toBeVisible();
  await expect(report.getByText('김지민').first()).toBeVisible();
  await report.getByRole('button', { name: /커밋 \d+개 더 보기/ }).click();
  await expect(report.getByRole('button', { name: '접기' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});

test('MCP is visible: handshakes, per-server traffic, JSON-RPC log, and recorded tools/call on the connections page', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.goto(DEMO);
  await page.getByRole('button', { name: '에이전트 실행' }).click();
  const topo = page.getByRole('figure', { name: 'MCP 연결 상태' });
  await expect(topo).toContainText('mawa-github v0.1.0');
  await expect(topo).toContainText(/stdio · MCP \d{4}-\d{2}-\d{2}/);
  await expect(page.locator('#activity').getByText(/MCP 호출 합계/)).toBeVisible({ timeout: 30_000 });
  await expect(topo).toContainText('핸드셰이크 4/4');
  await expect(topo).toContainText('mawa-lms v0.1.0');
  await page.locator('#activity').getByRole('button', { name: /JSON-RPC 메시지 \d+개/ }).click();
  const log = page.getByRole('list', { name: 'JSON-RPC 메시지' });
  await expect(log).toContainText('initialize');
  await expect(log).toContainText('tools/list');
  await log.getByRole('button', { name: /tools\/call \S+ #\d+/ }).first().click();
  await expect(log.locator('pre').first()).toContainText('"jsonrpc": "2.0"');

  await page.getByRole('link', { name: '연결' }).first().click();
  await expect(page.getByRole('heading', { name: 'GitHub MCP 서버' })).toBeVisible();
  await expect(page.getByText('node mcp-servers/github/dist/index.js --mode=demo')).toBeVisible();
  await page.getByRole('button', { name: /tools\/call 예시/ }).first().click();
  await expect(page.getByRole('list', { name: 'get_recent_commits JSON-RPC 메시지' })).toContainText('response');
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});

test('trust: validation demo shows the dropped citation, data-use panel, injection flag, short Slack update', async ({ page, context }) => {
  const { errors, api } = await collect(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${DEMO}#/runs`);
  await page.getByRole('link', { name: '출처 검증 시연' }).click();
  await expect(page.getByText(/일부러 주입한 기록/)).toBeVisible();
  await expect(page.getByText(/초안에서 1건 제외, 1건 '추론'으로 낮춤/)).toBeVisible();
  await expect(page.locator('#report code', { hasText: 'github:issue:demo-user/my-ai-work-agent#99' })).toBeVisible();

  await page.goto(`${DEMO}#/report/recorded_weekly-progress`);
  await expect(page.getByText('출처 검증: 모든 항목의 인용이 실제로 조회한 출처와 일치합니다')).toBeVisible();
  await expect(page.getByText(/의심 메일: "\[캡스톤\] 회의록 자동 정리"/)).toBeVisible();
  await expect(page.getByText('지시문 감지 · 데이터로만 처리', { exact: true }).first()).toBeVisible();
  // Decision first: risks come before the evidence sections.
  const order = (await page.locator('#report h3').allInnerTexts()).map((t) => t.replace(/\s*\d+\s*$/, '').trim());
  expect(order.indexOf('놓치면 안 되는 것')).toBeLessThan(order.indexOf('공부·개발 기록'));
  await expect(page.locator('#report').getByText(/^근거 · /).first()).toBeVisible();

  const panel = page.getByRole('region', { name: '데이터 사용 내역' });
  await expect(panel).toContainText(/메일 주소 \d+개 · 개인정보 \d+개 가림/);
  await expect(panel).toContainText('LLM·리포트에서 제외 1건');
  await panel.getByRole('button', { name: '자세히' }).click();
  await expect(panel).toContainText('리포트 작성 요청');
  await expect(panel).toContainText('gmail:msg:demo0011 · 규칙 “엄마”');

  await page.getByRole('button', { name: /짧게 복사/ }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('*할 일*');
  expect(clip.split('\n').length).toBeLessThan(25);
  expect(clip).not.toMatch(/엄마|쿠폰/);
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});

test('home: one-tap demo run ends with a visible link to the new report', async ({ page }) => {
  const { errors } = await collect(page);
  await page.goto(DEMO);
  await page.getByRole('button', { name: /데모 실행해 보기/ }).click();
  await expect(page.getByRole('button', { name: /실행 중… (MCP 연결 중|도구 \d+\/\d+|리포트 작성 중)/ }).first()).toBeVisible();
  const done = page.getByRole('status').filter({ hasText: '리포트 완성' });
  await expect(done).toBeVisible({ timeout: 30_000 });
  await done.getByRole('link', { name: /리포트 보기/ }).click();
  await expect(page).toHaveURL(/#\/report\/demo_weekly-progress_/);
  await page.reload();
  await page.getByRole('link', { name: '실행 기록' }).first().click();
  await expect(page.getByRole('table')).toContainText('이번 주 정리');
  expect(await page.locator('table tbody tr').count()).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
});

test('settings: the demo shows the data policy its recordings ran under (read-only)', async ({ page }) => {
  await page.goto(`${DEMO}#/settings`);
  const policy = page.getByRole('region', { name: '데이터 접근 정책' });
  await expect(policy.getByRole('textbox', { name: /제외할 단어/ })).toHaveValue('엄마, 쿠폰');
  await expect(policy.getByRole('textbox', { name: /제외할 단어/ })).toBeDisabled();
  await expect(policy.getByRole('checkbox', { name: /메일 주소 가리기/ })).toBeChecked();
});

test('report: category filter narrows the sections and the copy', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${DEMO}#/`);
  await page.getByRole('region', { name: '팀플', exact: true }).getByRole('link', { name: /팀플 전체 보기/ }).click();
  await expect(page).toHaveURL(/#\/report\/recorded_weekly-progress\?cat=/);
  const group = page.getByRole('group', { name: '카테고리' });
  await expect(group.getByRole('button', { name: /팀플/ })).toHaveAttribute('aria-pressed', 'true');
  const tags = await page.locator('#report [data-report-item]').allInnerTexts();
  expect(tags.length).toBeGreaterThan(3);
  expect(tags.join('\n')).not.toContain('Cloudflare');
  await page.getByRole('button', { name: /짧게 복사/ }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip.split('\n')[0]).toContain('· 팀플');
  expect(clip).not.toContain('코딩테스트');
  await group.getByRole('button', { name: '전체' }).click();
  expect((await page.locator('#report [data-report-item]').allInnerTexts()).join('\n')).toContain('Cloudflare');
});

test('audit log lists reads, LLM payloads and the refused call; the policy demo compares both runs', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.goto(`${DEMO}#/audit`);
  await expect(page.getByRole('heading', { name: '감사 로그', level: 2 })).toBeVisible();
  const table = page.getByRole('table', { name: '감사 로그' });
  await expect(table).toContainText('search_project_emails');
  await expect(table).toContainText('LLM 전송');
  await page.getByRole('button', { name: /^거절/ }).click();
  await expect(table.locator('tbody tr')).toHaveCount(1);
  await expect(table).toContainText('get_email');
  await expect(table).toContainText('허용 목록에 없는 도구');
  // Hash chain: the log verifies; a copy with one edited line fails at that line.
  await page.getByRole('button', { name: '검증', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '현재 로그' })).toContainText('모두 일치');
  await page.getByRole('button', { name: '한 줄 바꿔서 검증' }).click();
  await expect(page.getByRole('status').filter({ hasText: '바꾼 사본' })).toContainText('3번째 줄에서 검증 실패');
  // Another MCP client through the gateway, with its own chained log.
  const gw = page.getByRole('region', { name: /게이트웨이 기록/ });
  await gw.getByRole('button', { name: '자세히' }).click();
  await expect(gw).toContainText('claude-code');
  await expect(gw).toContainText('주민등록번호');
  await gw.getByRole('button', { name: '체인 검증' }).click();
  await expect(gw.getByRole('status')).toContainText('모두 일치');

  await page.goto(`${DEMO}#/report/recorded_policy-strict`);
  const compare = page.getByRole('region', { name: /정책 비교/ });
  await expect(compare).toContainText('호출 단계에서 거절');
  await expect(compare).toContainText('가린 개인정보');
  // Three recorded policies; picking one switches the report.
  await expect(compare.getByRole('link', { name: /엄격한 정책/ })).toHaveAttribute('aria-current', 'page');
  await compare.getByRole('link', { name: /정책 없음/ }).click();
  await expect(page).toHaveURL(/recorded_policy-off$/);
  await page.goto(`${DEMO}#/report/recorded_policy-strict`);
  await page.getByRole('button', { name: /단계 보기/ }).click();
  await expect(page.getByText(/정책이 gmail\.get_email 호출을 거절함/)).toBeVisible();
  expect(errors).toEqual([]);
  expect(api).toEqual([]);
});

test('personas: the same service as a student, a worker and the admin', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.goto(`${DEMO}#/`);
  const sw = page.getByRole('radiogroup', { name: '누구의 하루로 볼까요' }).first();
  await sw.getByRole('radio', { name: /학생/ }).click();
  await expect(page.getByRole('heading', { name: /성준님, 이번 주/ })).toBeVisible();
  await expect(page.getByRole('region', { name: '수업·과제', exact: true })).toBeVisible();

  await sw.getByRole('radio', { name: /직장인/ }).click();
  await expect(page.getByRole('heading', { name: /하은님, 이번 주/ })).toBeVisible();
  await expect(page.getByRole('region', { name: '업무·마감', exact: true })).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: '질문 선택' })).toContainText('1:1 준비');
  await expect(page.getByText('eCampus를 읽고')).toHaveCount(0);

  await sw.getByRole('radio', { name: /관리자/ }).click();
  await expect(page.getByRole('heading', { name: /구성원 AI 데이터 사용 현황/ })).toBeVisible();
  await expect(page.getByRole('region', { name: '보안 요약' })).toContainText('감사 로그 무결성 정상');
  await expect(page.getByRole('region', { name: /정책 비교/ })).toContainText('호출 단계에서 거절');
  await expect(page.getByRole('link', { name: '감사 로그', exact: true }).first()).toBeVisible();
  // The choice sticks across reloads.
  await page.reload();
  await expect(page.getByRole('heading', { name: /구성원 AI 데이터 사용 현황/ })).toBeVisible();
  await page.getByRole('radiogroup', { name: '누구의 하루로 볼까요' }).first().getByRole('radio', { name: /학생/ }).click();
  expect(errors).toEqual([]);
  expect(api).toEqual([]);
});
