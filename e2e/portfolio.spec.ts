import { expect, test } from '@playwright/test';

test('portfolio: keyboard navigation, presentation mode, honest demo labels, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:4174/', { waitUntil: 'load' });
  const counter = page.locator('nav[aria-label="Slides"] span[aria-live]');
  await expect(counter).toHaveText('01 / 10');
  await expect(page.getByRole('heading', { name: 'MY AI WORK AGENT' })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(1);

  await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText('02 / 10');
  await page.keyboard.press('Space');
  await expect(counter).toHaveText('03 / 10');
  await page.keyboard.press('ArrowLeft');
  await expect(counter).toHaveText('02 / 10');

  // Architecture slide: hovering a node changes the explanation panel.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText('04 / 10');
  await page.getByRole('button', { name: 'MCP CLIENT' }).hover();
  await expect(page.getByText('mcp-executor.ts')).toBeVisible();

  // Live demo slide is a labelled replay with a DEMO MODE badge.
  await page.keyboard.press('ArrowRight');
  await expect(counter).toHaveText('05 / 10');
  await expect(page.getByText('Demo mode', { exact: true })).toBeVisible();
  await expect(page.getByText('Recorded demo run replayed')).toBeVisible();

  // MCP explorer: three servers, generated snapshot note.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: 'GMAIL MCP' })).toBeVisible();
  await page.getByRole('button', { name: 'GMAIL MCP' }).click();
  await expect(page.getByRole('button', { name: 'search_project_emails' })).toBeVisible();
  await expect(page.getByText(/Snapshot generated from the running servers/)).toBeVisible();

  // Presentation mode toggles with P and exits with Escape (fullscreen may be refused headless; state still toggles).
  await page.keyboard.press('p');
  await expect(page.getByRole('button', { name: 'Exit presentation mode' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Enter presentation mode' })).toBeVisible();

  await page.keyboard.press('End');
  await expect(counter).toHaveText('10 / 10');
  await expect(page.getByText('@zun_it_').first()).toBeVisible();

  expect(errors).toEqual([]);
});
