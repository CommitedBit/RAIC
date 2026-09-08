import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { createSettingsStorage } from '../fixtures/test-data/settings';
import { quizLesson } from '../../tests/support/quiz-lesson';

test.use({ locale: 'en-US', viewport: { width: 1600, height: 1000 } });

async function seedLesson(page: Page, lesson: ReturnType<typeof quizLesson>) {
  await page.addInitScript(
    ({ settings, stageId }) => {
      localStorage.setItem('settings-storage', settings);
      sessionStorage.setItem(
        'classroomLaunchContext',
        JSON.stringify({ classroomId: stageId, launchMode: 'public-demo', homePath: '/' }),
      );
    },
    { settings: createSettingsStorage({ sidebarCollapsed: false }), stageId: lesson.id },
  );
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
      transaction
        .objectStore('stageOutlines')
        .put({ stageId: input.id, outlines: [], createdAt: 1, updatedAt: 1 });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, lesson);
}

test('legacy quiz keys produce correct neutral feedback on submission and reload without AI calls', async ({
  page,
}, testInfo) => {
  const lesson = quizLesson();
  let gradingCalls = 0;
  await page.route('**/api/quiz-grade', async (route) => {
    gradingCalls++;
    await route.abort();
  });
  await seedLesson(page, lesson);
  await page.evaluate(() => {
    localStorage.setItem(
      'quizAnswers:quiz-key-scene',
      JSON.stringify({ vector: 'A', ambiguous: 'B' }),
    );
    localStorage.setItem(
      'quizResults:quiz-key-scene',
      JSON.stringify([
        { questionId: 'vector', correct: false, status: 'incorrect', earned: 0 },
        { questionId: 'ambiguous', correct: false, status: 'incorrect', earned: 0 },
      ]),
    );
  });
  await page.goto(`/classroom/${lesson.id}`);
  await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => JSON.parse(localStorage.getItem('quizResults:quiz-key-scene') || '[]')),
    )
    .toMatchObject([
      { questionId: 'vector', correct: true, earned: 2 },
      { questionId: 'ambiguous', correct: null, status: 'ungraded', earned: 0 },
    ]);
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.getByRole('button', { name: 'Start Quiz', exact: true }).click();
  await page.getByRole('button', { name: 'A (6, 2)', exact: true }).click();
  await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
  await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'The answer key needs teacher review. This question is excluded from your score.',
      { exact: true },
    ),
  ).toHaveCount(1);
  expect(gradingCalls).toBe(0);
  await page.reload();
  await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
  await expect(page.getByText('100%', { exact: true })).toBeVisible();
  expect(gradingCalls).toBe(0);
  await expect
    .poll(() =>
      page.getByText('Quiz Report', { exact: true }).evaluate((node) => {
        for (let element: Element | null = node; element; element = element.parentElement) {
          if (Number(getComputedStyle(element).opacity) < 0.999) return false;
        }
        return true;
      }),
    )
    .toBe(true);
  await page.screenshot({ path: testInfo.outputPath('quiz-feedback.png'), animations: 'disabled' });
});

for (const status of [503, 200]) {
  test(`short-answer grading failure (${status}) saves an ungraded response without fabricated points`, async ({
    page,
  }) => {
    const lesson = quizLesson();
    if (lesson.scenes[0].content.type !== 'quiz') throw new Error('Expected quiz fixture');
    lesson.scenes[0].content.questions = [
      { id: 'explain', type: 'short_answer', question: 'Explain vector addition.', points: 4 },
    ];
    let gradingCalls = 0;
    await page.route('**/api/quiz-grade', async (route) => {
      gradingCalls++;
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify({ score: 'invalid', comment: 'Unavailable' }),
      });
    });
    await seedLesson(page, lesson);
    await page.goto(`/classroom/${lesson.id}`);
    await page.getByRole('button', { name: 'Start Quiz', exact: true }).click();
    await page.getByPlaceholder('Type your answer here...').fill('Add each matching coordinate.');
    await page.getByRole('button', { name: 'Submit Answers', exact: true }).click();
    await expect(page.getByText('Quiz Report', { exact: true })).toBeVisible();
    await expect(page.getByText('Not graded', { exact: true })).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem('quizResults:quiz-key-scene') || '[]')),
      )
      .toEqual([
        {
          questionId: 'explain',
          correct: null,
          status: 'ungraded',
          earned: 0,
          reason: 'grading_unavailable',
        },
      ]);
    await expect(
      page.getByText(
        'Feedback is unavailable. Your response is saved, and this question is excluded from your score.',
        { exact: true },
      ),
    ).toHaveCount(1);
    expect(gradingCalls).toBe(1);
    await page.reload();
    await expect(page.getByText('Not graded', { exact: true })).toBeVisible();
    expect(gradingCalls).toBe(1);
  });
}
