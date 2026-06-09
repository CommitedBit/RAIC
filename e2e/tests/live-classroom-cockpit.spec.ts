import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures/base';
import { ClassroomPage } from '../pages/classroom.page';
import {
  APP_BASE_URL,
  addSessionCookie,
  createAuthSession,
  resetRaicData,
  writeClassroomData,
  writePlatformStore,
} from './support/ai-governance';
import type { SharedSimulation } from '../../lib/types/stage';

test.use({ locale: 'en-US' });

test.beforeEach(async () => {
  await resetRaicData();
});

test.afterEach(async () => {
  await resetRaicData();
});

function createSharedSimulation(): SharedSimulation {
  return {
    provider: 'mirofish',
    simulationId: 'cockpit-sizing-sim',
    reportId: 'cockpit-sizing-report',
    runUrl: 'http://127.0.0.1:4101/simulation/cockpit-sizing-sim/start?embed=1',
    reportUrl: 'http://127.0.0.1:4101/report/cockpit-sizing-report?embed=1',
    activeSurface: 'lesson',
    controllerRole: 'teacher',
    collaborationMode: 'single-controller',
    collaborationState: 'inactive',
    allowStudentInteraction: false,
    participantCount: 0,
    lastCollaborationSyncAt: new Date().toISOString(),
    status: 'attached',
  };
}

async function ensureCockpitOpen(page: Page) {
  await expect(page.getByTestId('live-classroom-cockpit')).toBeVisible();

  const panel = page.getByTestId('live-classroom-cockpit-panel');
  if (!(await panel.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Open controls' }).click();
  }

  await expect(panel).toBeVisible();
  return panel;
}

test('keeps expanded teacher cockpit bounded and scrollable inside the stage canvas', async ({
  page,
}) => {
  const classroomId = 'live-cockpit-sizing';
  const teacherSession = createAuthSession({
    role: 'teacher',
    userId: 'teacher-live-cockpit-sizing',
    email: 'teacher-live-cockpit-sizing@example.com',
    displayName: 'Teacher Cockpit Sizing',
    organizationId: 'org-live-cockpit-sizing',
    organizationName: 'Live Cockpit Academy',
    organizationSlug: 'live-cockpit-academy',
  });

  await writePlatformStore({
    sessions: [teacherSession],
  });
  await writeClassroomData({
    classroomId,
    ownerUserId: teacherSession.user.id,
    organizationId: teacherSession.organization.id,
    stageName: 'Live Cockpit Sizing Lab',
    sceneTitles: ['Warm-up question', 'Simulation analysis', 'Exit reflection'],
    sharedSimulation: createSharedSimulation(),
  });

  await addSessionCookie(page.context(), teacherSession.token);
  await page.setViewportSize({ width: 1280, height: 720 });

  const classroom = new ClassroomPage(page);
  await page.goto(`${APP_BASE_URL}/classroom/${classroomId}`);
  await classroom.waitForLoaded();

  const panel = await ensureCockpitOpen(page);
  const scroll = page.getByTestId('live-classroom-cockpit-scroll');

  await expect(panel).toContainText('AI approval inbox');
  await expect(panel).toContainText('Quick intervene');

  const desktopGeometry = await page.getByTestId('live-classroom-cockpit').evaluate((root) => {
    const panelElement = root.querySelector(
      '[data-testid="live-classroom-cockpit-panel"]',
    ) as HTMLElement | null;
    const scrollElement = root.querySelector(
      '[data-testid="live-classroom-cockpit-scroll"]',
    ) as HTMLElement | null;
    const canvasElement = root instanceof HTMLElement ? root.offsetParent : null;
    const panelRect = panelElement?.getBoundingClientRect();
    const canvasRect = canvasElement?.getBoundingClientRect();

    return {
      canvasBottom: canvasRect?.bottom ?? 0,
      canvasHeight: canvasRect?.height ?? 0,
      canvasLeft: canvasRect?.left ?? 0,
      canvasRight: canvasRect?.right ?? 0,
      canvasTop: canvasRect?.top ?? 0,
      panelBottom: panelRect?.bottom ?? 0,
      panelLeft: panelRect?.left ?? 0,
      panelRight: panelRect?.right ?? 0,
      panelTop: panelRect?.top ?? 0,
      scrollClientHeight: scrollElement?.clientHeight ?? 0,
      scrollHeight: scrollElement?.scrollHeight ?? 0,
    };
  });

  expect(desktopGeometry.canvasHeight).toBeGreaterThan(0);
  expect(desktopGeometry.panelTop).toBeGreaterThanOrEqual(desktopGeometry.canvasTop - 1);
  expect(desktopGeometry.panelBottom).toBeLessThanOrEqual(desktopGeometry.canvasBottom + 1);
  expect(desktopGeometry.panelLeft).toBeGreaterThanOrEqual(desktopGeometry.canvasLeft - 1);
  expect(desktopGeometry.panelRight).toBeLessThanOrEqual(desktopGeometry.canvasRight + 1);
  expect(desktopGeometry.scrollHeight).toBeGreaterThan(desktopGeometry.scrollClientHeight);

  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(panel.getByRole('button', { name: 'Send intervention' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 720 });
  await ensureCockpitOpen(page);

  const narrowGeometry = await page.getByTestId('live-classroom-cockpit').evaluate((root) => {
    const rootRect = root.getBoundingClientRect();
    const panelElement = root.querySelector(
      '[data-testid="live-classroom-cockpit-panel"]',
    ) as HTMLElement | null;
    const panelRect = panelElement?.getBoundingClientRect();

    return {
      panelRight: panelRect?.right ?? 0,
      rootClientWidth: root.clientWidth,
      rootRight: rootRect.right,
      rootScrollWidth: root.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });

  expect(narrowGeometry.rootRight).toBeLessThanOrEqual(narrowGeometry.viewportWidth + 1);
  expect(narrowGeometry.panelRight).toBeLessThanOrEqual(narrowGeometry.viewportWidth + 1);
  expect(narrowGeometry.rootScrollWidth).toBeLessThanOrEqual(narrowGeometry.rootClientWidth + 1);
});
