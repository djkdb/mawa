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

test('standalone demo build: replay works with zero API/network calls and honest labels', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.goto(DEMO);
  await expect(page.getByRole('heading', { name: 'MY AI WORK AGENT' })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('Demo mode · synthetic data · recorded MCP run');
  await expect(page.getByText('none · recorded replay')).toBeVisible();

  // Example prompts are exactly the recorded ones.
  const examples = page.getByRole('group', { name: 'Example requests' }).getByRole('button');
  expect(await examples.count()).toBe(3);
  await examples.nth(2).click();
  await expect(page.locator('#prompt')).toHaveValue('최근 프로젝트에서 막히고 있는 부분을 찾아줘.');

  await page.getByRole('button', { name: /replay run/i }).click();
  await expect(page.getByText('Discovering MCP tools').or(page.getByText('tools discovered'))).toBeVisible();
  await expect(page.getByText('Report generated')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Weekly Work Report' })).toBeVisible();
  await expect(page.getByText('Completed')).toBeVisible();

  // The blockers run called GitHub and Gmail only; Calendar shows no calls.
  await expect(page.getByText(/GitHub MCP/).first()).toBeVisible();
  await expect(page.getByText('Recorded MCP run · replayed')).toBeVisible();

  // Source chips resolve, popover shows id/type/time.
  const chips = page.getByRole('button', { name: /^Source:/ });
  expect(await chips.count()).toBeGreaterThan(5);
  await chips.first().click();
  const dialog = page.getByRole('dialog', { name: 'Source details' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/(github|gmail|calendar):(commit|pr|issue|repo|msg|event):/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Sources panel lists the citable universe.
  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();

  // Honest labels: badge count, no "live data" claims.
  expect(await page.getByText('Demo mode · synthetic data').count()).toBeGreaterThanOrEqual(2);
  expect(await page.getByText(/live github data|live gmail data|real-time workspace/i).count()).toBe(0);

  expect(api, 'no API / external calls in demo mode').toEqual([]);
  expect(errors).toEqual([]);
});

test('standalone demo build: free-form prompt is refused honestly, mobile layout holds', async ({ page }) => {
  const { errors, api } = await collect(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(DEMO);
  await page.getByRole('group', { name: 'Example requests' }).getByRole('button').first().click();
  await page.getByRole('button', { name: /replay run/i }).click();
  await expect(page.getByText('Report generated')).toBeVisible({ timeout: 30_000 });
  // No horizontal overflow at 375px.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(api).toEqual([]);
  expect(errors).toEqual([]);
});
