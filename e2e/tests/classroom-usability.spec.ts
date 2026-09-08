import type { Page, TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/base';

const DEMO_ID = 'openraic-rit-diff-by-band';
const CHECK_ID = 'openraic-rit-demo-scene-check';
const PAID_PATHS = new Set([
  '/api/quiz-grade',
  '/api/chat',
  '/api/pbl/chat',
  '/api/verify-image-provider',
  '/api/verify-video-provider',
]);
test.use({ locale: 'en-US', colorScheme: 'light', viewport: { width: 1280, height: 720 } });

async function openDemo(page: Page) {
  const providerRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (PAID_PATHS.has(path) || path.startsWith('/api/generate/')) {
      providerRequests.push(path);
      await route.abort();
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByTestId('open-example-classroom-button').click();
  await page.waitForURL(`/classroom/${DEMO_ID}`);
  await expect(
    page.getByRole('heading', { name: 'RIT Input + Grouping Strategy', exact: true }),
  ).toBeVisible();
  return { providerRequests, pageErrors };
}

async function capture(page: Page, testInfo: TestInfo, filename: string) {
  await page.screenshot({
    path: testInfo.outputPath(filename),
    animations: 'disabled',
    timeout: 10_000,
  });
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

async function waitForSavedScene(page: Page, sceneId: string) {
  await expect
    .poll(() =>
      page.evaluate(async (id) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('RAIC-Database');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const current = await new Promise<string | undefined>((resolve, reject) => {
          const request = db.transaction('stages').objectStore('stages').get(id);
          request.onsuccess = () => resolve(request.result?.currentSceneId);
          request.onerror = () => reject(request.error);
        });
        db.close();
        return current;
      }, DEMO_ID),
    )
    .toBe(sceneId);
}

test('no-key demo grades a checkpoint, completes with real scene counts, and survives ordinary reloads', async ({
  page,
}, testInfo) => {
  const { providerRequests, pageErrors } = await openDemo(page);
  const frame = page.getByTestId('classroom-scene-frame');
  const box = await frame.boundingBox();
  expect(box!.width).toBeGreaterThan(640);
  expect(box!.height).toBeGreaterThan(360);
  await expectNoPageOverflow(page);
  await capture(page, testInfo, 'laptop-lesson.png');

  // Native Space activation must not be swallowed by global playback shortcuts.
  const guide = page.locator('summary').filter({ hasText: 'Lesson guide and notes' });
  await guide.focus();
  await guide.press('Space');
  await expect(page.getByTestId('lesson-flow-panel')).toBeVisible();
  await expect(
    page.getByRole('heading', {
      name: 'Adapt the amount of support while keeping one shared learning goal, then check understanding.',
    }),
  ).toBeVisible();
  await guide.press('Space');
  await expect(page.getByTestId('lesson-flow-panel')).not.toBeVisible();
  await page.getByRole('button', { name: 'Mute', exact: true }).focus();
  const volume = page.getByRole('slider', { name: 'Narration volume', exact: true });
  await expect(volume).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(volume).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(volume).toHaveValue('0.95');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Playback speed', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Reading view', exact: true }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByTestId('slide-reading-view')).toBeVisible();

  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Differentiated prompt examples', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await page.getByRole('button', { name: 'Start Quiz', exact: true }).click();
  await page.getByRole('button', { name: 'B Band B: 190–219', exact: true }).click();
  await page.getByRole('button', { name: 'A The shared learning goal', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
  await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      '214 is between 190 and 219, so Bri belongs in Band B for this example. Use varied practice and ask Bri to explain each step.',
      { exact: true },
    ),
  ).toBeVisible();
  await waitForSavedScene(page, CHECK_ID);
  await page.reload();
  await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'checkpoint-after-reload.png');

  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Try it in class', exact: true })).toBeVisible();
  await expect(page.locator('summary')).toContainText('Scene 4 of 4');
  await page.getByRole('button', { name: 'Finish lesson', exact: true }).click();
  const completion = page.getByTestId('classroom-completion');
  await expect(
    completion.getByRole('heading', { name: 'Course complete', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('lesson-flow-panel')).toHaveCount(0);
  await expect(page.getByTestId('board-notes-panel')).toHaveCount(0);
  await expect(
    completion.getByText('2 of 2 auto-graded choice questions correct', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Loading...', { exact: true })).toHaveCount(0);
  await expect(frame).toHaveAttribute('data-view', 'activity');
  await expect(completion.getByRole('button')).toHaveCount(6);
  await waitForSavedScene(page, '__pending__');
  await page.reload();
  await expect(completion.getByText('100%', { exact: true })).toBeVisible();
  await capture(page, testInfo, 'completion-after-reload.png');
  await completion.getByRole('button', { name: 'Review checkpoint', exact: true }).click();
  await expect(completion).toHaveCount(0);
  await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  expect(providerRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('phone lessons reflow and scene navigation remains usable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { providerRequests, pageErrors } = await openDemo(page);
  const reading = page.getByTestId('slide-reading-view');
  await expect(reading).toBeVisible();
  await expectNoPageOverflow(page);
  expect(
    await reading.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
  ).toBeGreaterThanOrEqual(16);
  await capture(page, testInfo, 'phone-reading.png');
  await page.getByRole('button', { name: 'Toggle sidebar', exact: true }).click();
  await expect(page.getByTestId('scene-list')).toBeVisible();
  const sidebar = await page.getByTestId('scene-list').boundingBox();
  expect(sidebar!.x + sidebar!.width).toBeLessThanOrEqual(390);
  await page.getByTestId('scene-item').nth(1).click();
  await expect(page.getByRole('button', { name: 'Toggle sidebar', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(
    page.getByRole('heading', { name: 'Differentiated prompt examples', exact: true }),
  ).toBeVisible();
  await expect(reading).toBeVisible();
  await expectNoPageOverflow(page);
  expect(providerRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('the layout equivalent of 200 percent laptop zoom keeps reading and controls reachable', async ({
  page,
}, testInfo) => {
  // 640×360 CSS pixels is the layout viewport of 1280×720 at 200% browser zoom.
  // This is reflow evidence, not a claim that the browser chrome zoom was operated.
  await page.setViewportSize({ width: 640, height: 360 });
  const { providerRequests, pageErrors } = await openDemo(page);
  await expect(page.getByTestId('slide-reading-view')).toBeVisible();
  await expectNoPageOverflow(page);
  await page.getByRole('button', { name: 'Next scene', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Differentiated prompt examples', exact: true }),
  ).toBeVisible();
  await page.getByTestId('slide-reading-view').scrollIntoViewIfNeeded();
  await capture(page, testInfo, 'zoom-equivalent-reading.png');
  await page.getByRole('button', { name: 'Back to Home', exact: true }).click();
  await expect(page.getByTestId('open-example-classroom-button')).toBeVisible();
  expect(providerRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});
