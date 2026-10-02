import { expect, test, type Page } from '@playwright/test';

const DEMO = 'http://localhost:4175/';

async function collect(page: Page) {
  const errors: string[] = [];
  const api: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { const u = r.url(); if (/\/api\/|\/auth\/|\/events/.test(u) || /github\.com|googleapis|anthropic|openai/.test(u)) api.push(u); });
  return { errors, api };
}

test('standalone demo: a finished recorded run is visible on first paint, replay works, zero network', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { name: 'My AI Work Agent' })).toBeVisible();
  await expect(page.getByText('데모 워크스페이스 · 샘플 데이터').first()).toBeVisible();

  // First paint already shows a completed recorded run: no empty state.
  await expect(page.getByRole('heading', { name: '주간 업무 리포트' })).toBeVisible();
  await expect(page.getByText('기록 재생')).toBeVisible();

  // Three recorded questions; pick the third and run.
  const options = page.getByRole('radiogroup', { name: '질문 선택' }).getByRole('radio');
  expect(await options.count()).toBe(3);
  await options.nth(2).click();
  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.getByText('에이전트가 도구를 고르고 MCP로 실행하는 중')).toBeVisible();
  await expect(page.getByText(/도구 \d+회 호출 \(GitHub, Gmail\)/)).toBeVisible({ timeout: 30_000 });

  // Collapsed activity expands to steps with verbs, tool names in mono.
  await page.getByRole('button', { name: '단계 보기' }).click();
  await expect(page.getByText('리포트 완성')).toBeVisible();
  await expect(page.getByText('GitHub · 열린 이슈 확인')).toBeVisible();
  await expect(page.getByText('get_open_issues()')).toBeVisible();

  // Citation chips open a popover with title, system, time and id.
  const chip = page.getByRole('button', { name: /^(PR #|이슈 #|커밋 |메일 · |일정 · )/ }).first();
  await chip.click();
  const dialog = page.getByRole('dialog', { name: '출처' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/(github|gmail|calendar):(commit|pr|issue|repo|msg|event):/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Sources list is collapsed but reachable.
  await page.getByRole('button', { name: /조회한 출처 \d+건/ }).click();
  await expect(page.getByText('Gmail', { exact: true }).first()).toBeVisible();

  expect(await page.getByText(/live github data|live gmail data|real-time workspace/i).count()).toBe(0);
  expect(api, 'no API / external calls in demo mode').toEqual([]);
  expect(errors).toEqual([]);
});

test('standalone demo: 375px layout has no horizontal overflow, before and after a run', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(DEMO);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.getByText(/도구 \d+회 호출/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^(PR #|이슈 #|커밋 |메일 · |일정 · )/ }).first().click();
  expect(await overflow()).toBeLessThanOrEqual(0);
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});
