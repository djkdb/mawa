import { expect, test } from '@playwright/test';

test('demo run streams MCP activity and renders a source-grounded report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'MY AI WORK AGENT' })).toBeVisible();
  await expect(page.getByText('scripted (no API key)')).toBeVisible();

  await page.getByRole('button', { name: /run agent/i }).click();
  await expect(page.getByText('Report generated')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('heading', { name: 'Weekly Work Report' })).toBeVisible();

  // Three MCP servers were actually called.
  await expect(page.getByText('GitHub MCP').first()).toBeVisible();
  await expect(page.getByText('Gmail MCP').first()).toBeVisible();
  await expect(page.getByText('Calendar MCP').first()).toBeVisible();

  // Demo output is always labelled.
  expect(await page.getByText('Demo mode').count()).toBeGreaterThanOrEqual(2);
  await expect(page.getByText('synthetic demo fixtures')).toBeVisible();

  // Every source chip resolves to a real source.
  const chips = page.getByRole('button', { name: /^Source:/ });
  expect(await chips.count()).toBeGreaterThan(10);
  await chips.first().click();
  await expect(page.getByText(/^(github|gmail|calendar):/)).toBeVisible();

  expect(errors).toEqual([]);
});
