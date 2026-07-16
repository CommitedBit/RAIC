import { expect, test } from '../fixtures/base';

test.use({ locale: 'en-US' });

const viewports = [
  { name: 'desktop', width: 1680, height: 1000 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'small-mobile', width: 320, height: 568 },
] as const;

test.describe('Homepage responsive hierarchy', () => {
  for (const viewport of viewports) {
    test(`${viewport.name} keeps the primary composer in view without horizontal overflow`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/');

      const demoLink = page.getByTestId('open-example-classroom-button');
      const schedule = page.getByTestId('schedule-classes-box');
      const textarea = page.locator('textarea');
      const agentTrigger = page.getByTestId('agent-bar-trigger');
      const agentDesktopSummary = page.getByTestId('agent-bar-desktop-summary');
      const pageHeading = page.getByRole('heading', {
        name: 'Responsive Assistance Interactive Classroom',
      });

      await expect(demoLink).toHaveCount(1);
      await expect(demoLink).toHaveAttribute('href', '/example');
      await expect(schedule.getByRole('button', { name: 'Schedule class' })).toBeVisible();
      await expect(schedule.getByText('No classes scheduled')).toHaveCount(0);
      await expect(textarea).toBeVisible();
      await expect(agentTrigger).toBeVisible();
      await expect(agentTrigger).toHaveAttribute('aria-expanded', 'false');
      await expect(pageHeading).toHaveClass(/sr-only/);

      const metrics = await page.evaluate(() => {
        const prompt = document.querySelector('textarea')?.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          pageWidth: document.documentElement.scrollWidth,
          promptTop: prompt?.top ?? Number.POSITIVE_INFINITY,
        };
      });
      const agentBox = await agentTrigger.boundingBox();

      expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth);
      expect(metrics.promptTop).toBeLessThan(viewport.height);
      expect(agentBox).not.toBeNull();
      expect(Math.ceil((agentBox?.x ?? 0) + (agentBox?.width ?? 0))).toBeLessThanOrEqual(
        viewport.width,
      );
      if (viewport.width < 640) {
        expect(agentBox?.width ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(80);
        await expect(agentDesktopSummary).toBeHidden();
      } else {
        await expect(agentDesktopSummary).toBeVisible();
      }

      await agentTrigger.click();
      await expect(agentTrigger).toHaveAttribute('aria-expanded', 'true');
      const agentPanel = page.getByTestId('agent-bar-panel');
      await expect(agentPanel).toBeVisible();
      const agentPanelBox = await agentPanel.boundingBox();
      expect(agentPanelBox).not.toBeNull();
      expect(Math.floor(agentPanelBox?.x ?? -1)).toBeGreaterThanOrEqual(0);
      expect(Math.ceil((agentPanelBox?.x ?? 0) + (agentPanelBox?.width ?? 0))).toBeLessThanOrEqual(
        viewport.width,
      );
    });
  }

  test('compact scheduling remains keyboard accessible', async ({ page }) => {
    await page.goto('/');

    const scheduleButton = page
      .getByTestId('schedule-classes-box')
      .getByRole('button', { name: 'Schedule class' });
    await scheduleButton.press('Enter');

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Class title')).toBeVisible();
  });
});
