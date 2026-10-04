import { expect, test } from '@playwright/test';

/**
 * Real mode, end to end, without an account: GitHub App sign-in against a fake github.com,
 * the real GitHub MCP server reading a fake REST API, and the API's claude-cli provider spawning a
 * fake `claude` (CLAUDE_BIN). Everything the fakes return is marked [가짜]. What this cannot check
 * — a real GitHub App, a real Claude login — is the checklist in docs/REAL_RUN.md.
 */
test.use({ baseURL: 'http://localhost:4176' });

test('real mode: connect GitHub (App), run, live activity, report with sources, recording line', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  // Recording mode on before signing in; it must survive the OAuth round trip.
  await page.goto('/?record=1#/connections');
  const github = page.locator('#connections li').filter({ hasText: 'GitHub' });
  await expect(github).toContainText('연결 안 됨');
  await github.getByRole('link', { name: '연결' }).click();

  // Fake consent screen: a GitHub App sends no scope parameter.
  await expect(page.getByRole('heading', { name: /가짜 GitHub 승인 화면/ })).toBeVisible();
  await expect(page.getByText('scope=(없음 — GitHub App)')).toBeVisible();
  await page.getByRole('link', { name: 'Authorize' }).click();

  // Back on the home page, query string cleaned, notice shown.
  await expect(page).toHaveURL(/localhost:4176\/(#\/?)?$/);
  await expect(page.getByText('GitHub 연결됨. 홈에서 질문을 실행하세요.')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '이번 주', exact: true })).toBeVisible();
  // No recording line before any run.
  await expect(page.getByTestId('real-run-banner')).toHaveCount(0);

  // AGENT_MODE=real: the composer starts in real mode once GitHub is connected.
  await expect(page.getByRole('radio', { name: '실제' })).toHaveAttribute('aria-checked', 'true');
  await page.locator('#prompt').fill('이번 주 내 GitHub 활동이랑 리뷰 대기 정리해줘.');
  await page.getByRole('button', { name: '에이전트 실행' }).click();

  // The line appears from the run's own events, while it is running.
  const banner = page.getByTestId('real-run-banner');
  await expect(banner).toContainText('실제 실행 · 실제 데이터 ·');
  await expect(banner).toContainText('claude-cli/');
  // Live activity over SSE: the real GitHub MCP server's calls show up.
  await expect(page.getByText(/get_recent_commits/).first()).toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText('완료', { timeout: 45_000 });
  await expect(banner).toContainText('claude-cli/fake-claude-e2e');
  await page.screenshot({ path: 'test-results/real-run-home.png' });

  // Report and sources come from the fake GitHub data, not from samples.
  await page.getByRole('link', { name: '리포트 보기' }).click();
  await expect(page.getByTestId('real-run-banner')).toContainText('실제 실행 · 실제 데이터');
  await expect(page.getByText('[가짜 모델] [가짜] 로그인 화면 추가').first()).toBeVisible();
  await expect(page.getByText('실제 데이터').first()).toBeVisible();
  await expect(page.getByText(/가상의 샘플 데이터입니다/)).toHaveCount(0);
  const chips = page.getByRole('button', { name: /^(PR #|이슈 #|커밋 )/ });
  expect(await chips.count()).toBeGreaterThan(0);
  await chips.first().click();
  await expect(page.getByRole('dialog', { name: '출처' })).toContainText('github:');
  await page.keyboard.press('Escape');

  // Recording mode hid the account everywhere; report content stays.
  await page.getByRole('link', { name: '연결' }).first().click();
  await expect(page.locator('#connections li').filter({ hasText: 'GitHub' })).toContainText('연결됨 (내 계정)');
  expect(await page.locator('body').innerText()).not.toContain('fake-dev@');
  await expect(page.locator('aside')).not.toContainText('fake-dev');

  expect(errors).toEqual([]);
});

test('real-mode server, demo run: no recording line', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('radio', { name: '데모' }).click();
  await page.getByRole('button', { name: '에이전트 실행' }).click();
  await expect(page.getByRole('link', { name: '리포트 보기' })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('real-run-banner')).toHaveCount(0);
  await page.getByRole('link', { name: '리포트 보기' }).click();
  await expect(page.getByRole('main').getByText('데모 워크스페이스 · 샘플 데이터').first()).toBeVisible();
  await expect(page.getByTestId('real-run-banner')).toHaveCount(0);
});

test('real mode failure is shown as a failure, with nothing filled in from samples', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('radio', { name: '실제' })).toHaveAttribute('aria-checked', 'true');
  await page.locator('#prompt').fill('[e2e-fail] 이번 주 정리');
  await page.getByRole('button', { name: '에이전트 실행' }).click();
  const banner = page.getByTestId('real-run-banner');
  await expect(banner).toContainText('실패', { timeout: 30_000 });
  await expect(page.getByRole('alert')).toContainText('OAuth session expired (fake)');
  await expect(page.getByRole('link', { name: '리포트 보기' })).toHaveCount(0);
  await page.screenshot({ path: 'test-results/real-run-failed.png' });
});
