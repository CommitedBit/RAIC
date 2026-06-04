import { expect, test } from '../fixtures/base';
import { ClassroomPage } from '../pages/classroom.page';
import {
  APP_BASE_URL,
  addSessionCookie,
  createAuthSession,
  readPlatformStore,
  resetRaicData,
  writeClassroomData,
  writePlatformStore,
} from './support/ai-governance';

test.describe.configure({ mode: 'serial' });
test.use({ locale: 'en-US' });

test.beforeEach(async () => {
  await resetRaicData();
});

test.afterAll(async () => {
  await resetRaicData();
});

test('teacher saves the governed co-thinking agency reflection template', async ({ page }) => {
  const classroomId = 'classroom-governed-reflection';
  const teacherSession = createAuthSession({
    role: 'teacher',
    userId: 'teacher-governed-reflection',
    email: 'teacher-governed@example.com',
    displayName: 'Governed Teacher',
    organizationId: 'org-governed-reflection',
    organizationName: 'Governed Reflection School',
    organizationSlug: 'governed-reflection-school',
  });

  await writePlatformStore({
    sessions: [teacherSession],
  });
  await writeClassroomData({
    classroomId,
    ownerUserId: teacherSession.user.id,
    organizationId: teacherSession.organization.id,
    stageName: 'Governed Reflection Lab',
    sceneTitles: ['Baseline intention', 'Agency reflection'],
    sourceContext: {
      pdfAttached: false,
      tavilyEnabled: false,
      sourceMode: 'none',
      language: 'en-US',
      selectedModel: 'smoke:model',
      creationMode: 'course',
      experiencePreset: 'governed-co-thinking',
    },
  });

  await addSessionCookie(page.context(), teacherSession.token);
  const classroom = new ClassroomPage(page);
  await page.goto(`${APP_BASE_URL}/classroom/${classroomId}`);
  await classroom.waitForLoaded();

  const reflectionButton = page.getByRole('button', { name: 'Session Reflection' });
  await expect(reflectionButton).toBeVisible();
  await reflectionButton.click();

  await expect(
    page.getByRole('heading', { name: 'Governed Co-Thinking Reflection' }),
  ).toBeVisible();
  await expect(page.getByTestId('governed-co-thinking-reflection-template')).toContainText(
    'What no-AI transfer task should the next classroom revisit?',
  );

  await page
    .getByLabel('Reflection summary')
    .fill(
      'Class-level agency evidence: learners named intentions, checked AI claims, and rewrote outputs in their own voice.',
    );
  await page.getByLabel('Challenging areas').fill('verification, transfer');
  await page.getByLabel('Confidence (1-5)').fill('4');

  await page.getByRole('button', { name: 'Save Reflection' }).click();
  await expect(page.getByText('Session reflection saved.')).toBeVisible();

  const store = await readPlatformStore();
  const reflection = store.classroomReflections.find((entry) => entry.classroomId === classroomId);

  expect(reflection).toBeTruthy();
  expect(reflection).toMatchObject({
    classroomId,
    organizationId: teacherSession.organization.id,
    userId: teacherSession.user.id,
    summary:
      'Class-level agency evidence: learners named intentions, checked AI claims, and rewrote outputs in their own voice.',
    challengingAreas: ['verification', 'transfer'],
    confidenceScore: 4,
    revisitIntent: 'continue',
  });
  expect(Object.keys(reflection!).sort()).toEqual(
    [
      'challengingAreas',
      'classroomId',
      'confidenceScore',
      'createdAt',
      'id',
      'organizationId',
      'revisitIntent',
      'summary',
      'userId',
    ].sort(),
  );
});
