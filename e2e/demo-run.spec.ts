import { expect, test } from '@playwright/test';

/** API-backed workspace: real API process, real MCP servers in demo mode. */
test('API-backed workspace runs the agent and shows a source-grounded report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '이번 주 업무' })).toBeVisible();
  await expect(page.locator('#prompt')).toBeVisible();
  await expect(page.getByRole('radio', { name: '실제' })).toBeDisabled();

  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.getByText(/도구 \d+회 호출 \((?=.*GitHub)(?=.*Gmail)(?=.*Calendar)[^)]*\)/)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('heading', { name: '주의할 점' })).toBeVisible();

  await page.getByRole('link', { name: '리포트' }).first().click();
  await expect(page.getByRole('heading', { level: 2, name: '주간 업무 리포트' })).toBeVisible();
  expect(await page.getByText('데모 워크스페이스 · 샘플 데이터').count()).toBeGreaterThanOrEqual(1);
  await expect(page.getByText('샘플 데이터로 만든 리포트이며 실제 계정 정보가 아닙니다')).toBeVisible();
  const chips = page.getByRole('button', { name: /^(PR #|이슈 #|커밋 |메일 · |일정 · )/ });
  expect(await chips.count()).toBeGreaterThan(10);
  await chips.first().click();
  await expect(page.getByRole('dialog', { name: '출처' })).toContainText(/(github|gmail|calendar):(commit|pr|issue|repo|msg|event):/);

  // Run history comes from the API.
  await page.getByRole('link', { name: '실행 기록' }).first().click();
  await expect(page.getByRole('row').filter({ hasText: '완료' }).first()).toBeVisible();

  // Connections show real OAuth status (not configured here).
  await page.getByRole('link', { name: '연결' }).first().click();
  await expect(page.getByText('OAuth 미설정').first()).toBeVisible();

  expect(errors).toEqual([]);
});
