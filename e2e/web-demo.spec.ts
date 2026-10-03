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
  await expect(page.getByText('GitHub·Gmail·Google Calendar를 읽고 출처가 달린 주간 리포트를 써 주는 AI 업무 에이전트입니다.')).toBeVisible();
  await expect(page.getByRole('heading', { name: /demo-user님, 이번 주 업무/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: '주의할 점' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '다가오는 일정' })).toBeVisible();
  await expect(page.locator('.pri-high').first()).toBeVisible();
  await expect(page.getByText(/^(D-\d+|내일|오늘)$/).first()).toBeVisible();

  // Keyboard radio group: one tab stop, arrows select.
  const radios = page.getByRole('radiogroup', { name: '질문 선택' }).getByRole('radio');
  await radios.first().focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(radios.nth(2)).toHaveAttribute('aria-checked', 'true');
  await expect(radios.nth(2)).toBeFocused();

  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.locator('#activity-heading')).toBeFocused();
  await expect(page.getByText(/도구 \d+회 호출 \(GitHub, Gmail\) · 출처 \d+건 · MCP 호출 합계 \d+ms/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('도구 선택: 질문별 실행 계획(스크립트)', { exact: false })).toBeVisible();

  // Tool call details: inputs, result, duration; raw events.
  await page.getByRole('button', { name: '단계 보기' }).click();
  await expect(page.getByText('요청 수신')).toBeVisible();
  await page.getByRole('button', { name: /GitHub · 열린 이슈 확인/ }).click();
  await expect(page.getByText('stdio', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/ms \(기록 당시 MCP 호출 시간\)/).first()).toBeVisible();
  await page.getByRole('button', { name: /원시 이벤트 \d+개/ }).click();
  await expect(page.getByRole('table', { name: '에이전트 이벤트 트레이스' })).toContainText('tool_call_completed');

  // Blocker run has its own sections and no "커밋 0개".
  await expect(page.getByRole('heading', { name: '막힌 항목' })).toBeVisible();
  expect(await page.getByText(/커밋 0개/).count()).toBe(0);

  expect(api, 'no API / external calls in demo mode').toEqual([]);
  expect(errors).toEqual([]);
});

test('report: deep link survives reload, copy for Slack, hide items, demo sources have no fake links', async ({ page, context }) => {
  const { errors, api } = await collect(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(`${DEMO}#/report/recorded_blockers`);
  await expect(page.getByRole('heading', { level: 2, name: '막히고 있는 부분 찾기' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { level: 2, name: '막히고 있는 부분 찾기' })).toBeVisible();
  await expect(page).toHaveTitle('리포트 · My AI Work Agent');

  // Hide one item, then copy: the hidden item is excluded.
  const firstItem = page.locator('#report [data-report-item]').first();
  const hiddenText = (await firstItem.locator('.item-text').innerText()).split('\n')[0]!.replace(/^(높음|보통|낮음)/, '').slice(0, 20);
  await firstItem.getByRole('button', { name: '복사할 때 이 항목 빼기' }).click();
  await expect(page.getByRole('button', { name: /숨긴 항목 1개 되돌리기/ })).toBeVisible();
  await page.getByRole('button', { name: 'Slack용 복사' }).click();
  await expect(page.locator('#report').getByText(/Slack 형식으로 복사했습니다 \(숨긴 항목 1개 제외\)/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Slack 형식으로 복사했습니다' })).toHaveCount(1);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('*막히고 있는 부분 찾기*');
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
  await page.getByRole('link', { name: '가장 중요한 작업과 다음 액션' }).click();
  await expect(page).toHaveURL(/#\/report\/recorded_priorities$/);
  await expect(page.getByRole('heading', { level: 2, name: '가장 중요한 작업과 다음 액션' })).toBeVisible();

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
  await expect(report.getByText('리뷰 코멘트 3')).toBeVisible();
  await expect(report.getByText(/^\d{2}:\d{2}–\d{2}:\d{2}$/).first()).toBeVisible();
  await expect(report.getByText('Kim Minji').first()).toBeVisible();
  await report.getByRole('button', { name: /커밋 \d+개 더 보기/ }).click();
  await expect(report.getByRole('button', { name: '접기' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});
