import { expect, test } from '@playwright/test';

/** API-backed UI: real API process, real MCP servers in demo mode. */
test('API-backed demo run streams MCP activity and renders a source-grounded report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'My AI Work Agent' })).toBeVisible();
  // API build: no recorded run on first paint; free-form input exists; mode toggle visible.
  await expect(page.getByRole('heading', { name: '주간 업무 리포트' })).toHaveCount(0);
  await expect(page.locator('#prompt')).toBeVisible();
  await expect(page.getByRole('radio', { name: '실제' })).toBeDisabled();

  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.getByRole('heading', { name: '주간 업무 리포트' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: '단계 보기' }).click();
  await expect(page.getByText('리포트 완성')).toBeVisible();
  await expect(page.getByText(/도구 \d+회 호출 \((?=.*GitHub)(?=.*Gmail)(?=.*Calendar)[^)]*\)/)).toBeVisible();

  // Three MCP servers were actually called (sidebar counts).
  for (const name of ['GitHub', 'Gmail', 'Google Calendar']) {
    await expect(page.getByRole('listitem').filter({ hasText: name }).filter({ hasText: /이번 실행 \d+회 조회/ }).first()).toBeVisible();
  }

  // Demo output is labelled from data.
  expect(await page.getByText('데모 워크스페이스 · 샘플 데이터').count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('샘플 데이터로 만든 리포트이며 실제 계정 정보가 아닙니다')).toBeVisible();

  // Citation chips resolve to real sources.
  const chips = page.getByRole('button', { name: /^(PR #|이슈 #|커밋 |메일 · |일정 · )/ });
  expect(await chips.count()).toBeGreaterThan(10);
  await chips.first().click();
  await expect(page.getByRole('dialog', { name: '출처' })).toContainText(/(github|gmail|calendar):(commit|pr|issue|repo|msg|event):/);

  expect(errors).toEqual([]);
});
