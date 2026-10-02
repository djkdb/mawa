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

test('workspace demo: dashboard on first paint, replay, report, history, connections, zero network', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.goto(DEMO);
  // Dashboard with this week's numbers and highlights, from a recorded run.
  await expect(page.getByRole('heading', { name: /demo-user님, 이번 주 업무/ })).toBeVisible();
  await expect(page.getByText('데모 워크스페이스 · 샘플 데이터').first()).toBeVisible();
  await expect(page.getByText('기록 재생')).toBeVisible();
  await expect(page.getByRole('heading', { name: '주의할 점' })).toBeVisible();

  // Replay another question.
  const options = page.getByRole('radiogroup', { name: '질문 선택' }).getByRole('radio');
  expect(await options.count()).toBe(3);
  await options.nth(2).click();
  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.getByText('에이전트가 도구를 고르고 MCP로 실행하는 중')).toBeVisible();
  await expect(page.getByText(/도구 \d+회 호출 \(GitHub, Gmail\)/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '단계 보기' }).click();
  await expect(page.getByText('GitHub · 열린 이슈 확인')).toBeVisible();
  await expect(page.getByText('get_open_issues()')).toBeVisible();

  // Report page with citation chips and a popover.
  await page.getByRole('link', { name: '리포트' }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: '주간 업무 리포트' })).toBeVisible();
  await page.getByRole('button', { name: CHIP }).first().click();
  const dialog = page.getByRole('dialog', { name: '출처' });
  await expect(dialog).toContainText(/(github|gmail|calendar):(commit|pr|issue|repo|msg|event):/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: /조회한 출처 \d+건/ }).click();

  // Run history lists the session run plus the shipped recordings; opening one shows its report.
  await page.getByRole('link', { name: '실행 기록' }).first().click();
  const rows = page.getByRole('row').filter({ hasText: /완료/ });
  await expect(rows.first()).toBeVisible();
  await expect(rows).toHaveCount(4);
  await rows.nth(1).getByRole('button').click();
  await expect(page.getByRole('heading', { level: 2, name: '주간 업무 리포트' })).toBeVisible();

  // Connections page lists tools per server in Korean.
  await page.getByRole('link', { name: '연결' }).first().click();
  await expect(page.getByRole('heading', { name: 'Gmail 도구' })).toBeVisible();
  await expect(page.getByText('search_project_emails', { exact: true })).toBeVisible();

  // Settings is honest about the model and data.
  await page.getByRole('link', { name: '설정' }).first().click();
  await expect(page.getByText('사용 안 함 (기록된 결과 재생)')).toBeVisible();

  expect(await page.getByText(/live github data|live gmail data|real-time workspace/i).count()).toBe(0);
  expect(api, 'no API / external calls in demo mode').toEqual([]);
  expect(errors).toEqual([]);
});

test('workspace demo: phone layout has a bottom tab bar and no horizontal overflow', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(DEMO);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.getByText(/도구 \d+회 호출/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('link', { name: '리포트' }).last().click();
  await page.getByRole('button', { name: CHIP }).first().click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});
