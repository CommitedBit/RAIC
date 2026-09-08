import katex from 'katex';
import { expect, test } from '../fixtures/base';
import { ClassroomPage } from '../pages/classroom.page';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { formulaLesson } from '../../tests/support/formula-lesson';

test.use({ locale: 'en-US' });

test('legacy local formulas remain inert and retain KaTeX layout after reload', async ({
  page,
}, testInfo) => {
  const latex = String.raw`\frac{1}{\sqrt{x^2+1}}`;
  const html = katex.renderToString(latex, { output: 'htmlAndMathml', trust: false });
  const lesson = formulaLesson(
    '<img src="/formula-unsafe-probe" onerror="document.body.dataset.formulaExecuted=1">' + html,
  );
  const unexpectedRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/formula-unsafe-probe')) unexpectedRequests.push(request.url());
  });
  await page.addInitScript(
    ({ stageId, settings }) => {
      localStorage.setItem('settings-storage', settings);
      sessionStorage.setItem(
        'classroomLaunchContext',
        JSON.stringify({
          classroomId: stageId,
          launchMode: 'public-demo',
          homePath: '/',
        }),
      );
    },
    { stageId: lesson.id, settings: createSettingsStorage({ sidebarCollapsed: false }) },
  );
  // Opening the homepage initializes the real Dexie schema before legacy data is seeded.
  await page.goto('/', { waitUntil: 'networkidle' });
  await page.evaluate(async (input) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('RAIC-Database');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(['stages', 'scenes', 'stageOutlines'], 'readwrite');
      transaction.objectStore('stages').put(input.stage);
      for (const scene of input.scenes) transaction.objectStore('scenes').put(scene);
      transaction.objectStore('stageOutlines').put({
        stageId: input.id,
        outlines: [],
        createdAt: 1,
        updatedAt: 1,
      });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  }, lesson);

  const classroom = new ClassroomPage(page);
  await classroom.goto(lesson.id);
  for (let visit = 0; visit < 2; visit++) {
    if (visit > 0) await page.reload();
    await classroom.waitForLoaded();
    await expect(page.locator('.katex svg path').last()).toBeVisible();
    await expect(page.locator('.katex svg').last()).toHaveAttribute('viewBox', /\S/);
    await expect(page.locator('.katex-mathml annotation').last()).toHaveText(latex);
    await expect(page.locator('img[src*="formula-unsafe-probe"], [onerror]')).toHaveCount(0);
    expect(await page.evaluate(() => document.body.dataset.formulaExecuted)).toBeUndefined();
    expect(unexpectedRequests).toEqual([]);
  }
  await page.screenshot({ path: testInfo.outputPath('formula-classroom.png') });
});
