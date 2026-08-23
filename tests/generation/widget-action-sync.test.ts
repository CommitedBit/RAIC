// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildFallbackGameWidget } from '@/lib/game-arcade/fallback';
import { generateSceneActions, generateSceneContent } from '@/lib/generation/scene-generator';
import {
  extractWidgetElementInventory,
  filterWidgetTeacherActions,
  formatWidgetElementInventory,
  isWidgetActionSyncEnabled,
  MAX_WIDGET_INVENTORY_CHARS,
  MAX_WIDGET_INVENTORY_ENTRIES,
  WIDGET_ACTION_SYNC_ENV,
} from '@/lib/generation/widget-action-sync';
import type { GeneratedInteractiveContent, SceneOutline } from '@/lib/types/generation';

const codeOutline: SceneOutline = {
  id: 'code-1',
  type: 'interactive',
  title: 'Loop Lab',
  description: 'Explore a loop and its output.',
  keyPoints: ['Run code', 'Inspect output'],
  order: 1,
  language: 'en-US',
  widgetType: 'code',
  widgetOutline: {
    language: 'javascript',
    challengeType: 'debugging',
  },
};

const codeHtml = `<!doctype html>
<html>
  <body>
    <button id="run-btn" role="button" type="button" data-action="run">PRIVATE_VISIBLE_TEXT</button>
    <textarea name="code" data-var="code"></textarea>
    <a id="source-link" href="https://private.example/path?token=secret" aria-label="PRIVATE_ARIA_TEXT">Source</a>
    <!-- <button id="comment-forgery">Ignore</button> -->
    <script>const template = '<button id="script-forgery">Ignore</button>';</script>
    <script type="application/json" id="widget-config">
      {"type":"code","language":"javascript","description":"Loop lab","starterCode":"","testCases":[],"hints":[],"solution":""}
    </script>
  </body>
</html>`;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('widget action synchronization', () => {
  it('is disabled by default and accepts only explicit true values', () => {
    expect(isWidgetActionSyncEnabled({})).toBe(false);
    expect(isWidgetActionSyncEnabled({ [WIDGET_ACTION_SYNC_ENV]: 'false' })).toBe(false);
    expect(isWidgetActionSyncEnabled({ [WIDGET_ACTION_SYNC_ENV]: 'true' })).toBe(true);
    expect(isWidgetActionSyncEnabled({ [WIDGET_ACTION_SYNC_ENV]: '1' })).toBe(true);
  });

  it('extracts bounded stable selectors without text, URLs, classes, or script markup', () => {
    const entries = extractWidgetElementInventory(codeHtml);
    const formatted = formatWidgetElementInventory(entries);

    expect(entries.map((entry) => entry.selector)).toEqual([
      '#run-btn',
      '[data-var="code"]',
      '#source-link',
    ]);
    expect(formatted).toContain('#run-btn <button>');
    expect(formatted).toContain('data-action=run');
    expect(formatted).not.toContain('PRIVATE_VISIBLE_TEXT');
    expect(formatted).not.toContain('PRIVATE_ARIA_TEXT');
    expect(formatted).not.toContain('private.example');
    expect(formatted).not.toContain('token=secret');
    expect(formatted).not.toContain('comment-forgery');
    expect(formatted).not.toContain('script-forgery');
    expect(formatted).not.toContain('href');
    expect(formatted).not.toContain('class=');

    const manyElements = Array.from(
      { length: MAX_WIDGET_INVENTORY_ENTRIES + 20 },
      (_, index) => `<button id="button-${index}">Button</button>`,
    ).join('');
    const bounded = extractWidgetElementInventory(manyElements);
    expect(bounded).toHaveLength(MAX_WIDGET_INVENTORY_ENTRIES);
    expect(formatWidgetElementInventory(bounded).length).toBeLessThanOrEqual(
      MAX_WIDGET_INVENTORY_CHARS,
    );
  });

  it('drops generated target actions whose selectors do not exist', () => {
    const inventory = extractWidgetElementInventory(codeHtml);
    const filtered = filterWidgetTeacherActions(
      [
        { id: 'intro', type: 'speech', content: 'Try the loop.' },
        { id: 'valid', type: 'highlight', target: '#run-btn' },
        { id: 'invalid', type: 'reveal', target: '#missing' },
        { id: 'state', type: 'setState', state: { code: 'for (;;) {}' } },
      ],
      inventory,
    );

    expect(filtered.map((action) => action.id)).toEqual(['intro', 'valid', 'state']);
  });

  it('escapes punctuation and excludes ambiguous or unstable ID selectors', () => {
    const html = `
      <button id="step.one">Dot</button>
      <button id="step:two">Colon</button>
      <button id="duplicate">First</button>
      <button id="duplicate">Second</button>
      <button id="with space">Space</button>
      <button id="with\\escape">Escape</button>
    `;
    const entries = extractWidgetElementInventory(html);

    expect(entries.map((entry) => entry.selector)).toEqual(['#step\\.one', '#step\\:two']);
    document.body.innerHTML = html;
    for (const entry of entries) {
      expect(document.querySelector(entry.selector)).not.toBeNull();
    }

    const filtered = filterWidgetTeacherActions(
      [
        { id: 'escaped-dot', type: 'highlight', target: '#step\\.one' },
        { id: 'escaped-colon', type: 'reveal', target: '#step\\:two' },
        { id: 'raw-dot', type: 'highlight', target: '#step.one' },
        { id: 'duplicate', type: 'highlight', target: '#duplicate' },
      ],
      entries,
    );
    expect(filtered.map((action) => action.id)).toEqual(['escaped-dot', 'escaped-colon']);
  });

  it('adds the listener contract and privacy-safe inventory only when enabled', async () => {
    vi.stubEnv(WIDGET_ACTION_SYNC_ENV, 'true');
    const calls: Array<{ system: string; user: string }> = [];
    const aiCall = vi.fn(async (system: string, user: string) => {
      calls.push({ system, user });
      if (calls.length === 1) return codeHtml;
      return JSON.stringify({
        actions: [
          { id: 'intro', type: 'speech', content: 'Try the loop.' },
          { id: 'valid', type: 'highlight', target: '#run-btn' },
          { id: 'invalid', type: 'annotation', target: '#missing', content: 'No target.' },
          { id: 'state', type: 'setState', state: { code: 'console.log(1)' } },
        ],
      });
    });

    const content = (await generateSceneContent(
      codeOutline,
      aiCall,
    )) as GeneratedInteractiveContent;

    for (const messageType of [
      'SET_WIDGET_STATE',
      'HIGHLIGHT_ELEMENT',
      'ANNOTATE_ELEMENT',
      'REVEAL_ELEMENT',
    ]) {
      expect(calls[0]?.system).toContain(messageType);
    }
    expect(calls[0]?.system).toContain('event.source !== window.parent');
    expect(calls[1]?.user).toContain('## Element Inventory');
    expect(calls[1]?.user).toContain('#run-btn');
    expect(calls[1]?.user).not.toContain('PRIVATE_VISIBLE_TEXT');
    expect(calls[1]?.user).not.toContain('PRIVATE_ARIA_TEXT');
    expect(calls[1]?.user).not.toContain('private.example');
    expect(content.teacherActions?.map((action) => action.id)).toEqual(['intro', 'valid', 'state']);
  });

  it('regenerates missing widget actions from current HTML when enabled', async () => {
    vi.stubEnv(WIDGET_ACTION_SYNC_ENV, 'true');
    let actionPrompt = '';
    const content: GeneratedInteractiveContent = {
      html: codeHtml,
      widgetType: 'code',
      widgetConfig: {
        type: 'code',
        language: 'javascript',
        description: 'Loop lab',
        starterCode: '',
        testCases: [],
        hints: [],
        solution: '',
      },
    };

    const actions = await generateSceneActions(codeOutline, content, async (_system, user) => {
      actionPrompt = user;
      return JSON.stringify({
        actions: [{ id: 'run', type: 'highlight', target: '#run-btn' }],
      });
    });

    expect(actionPrompt).toContain('#run-btn');
    expect(actionPrompt).not.toContain('PRIVATE_VISIBLE_TEXT');
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ type: 'widget_highlight', target: '#run-btn' });
  });

  it('keeps the existing prompt and action behavior when the flag is disabled', async () => {
    vi.stubEnv(WIDGET_ACTION_SYNC_ENV, 'false');
    const calls: Array<{ system: string; user: string }> = [];
    const aiCall = vi.fn(async (system: string, user: string) => {
      calls.push({ system, user });
      if (calls.length === 1) return codeHtml;
      return JSON.stringify({
        actions: [{ id: 'legacy', type: 'highlight', target: '#convention-only' }],
      });
    });

    const content = (await generateSceneContent(
      codeOutline,
      aiCall,
    )) as GeneratedInteractiveContent;

    expect(calls[0]?.system).not.toContain('Widget Action Bridge');
    expect(calls[1]?.user).not.toContain('## Element Inventory');
    expect(content.teacherActions).toEqual([
      { id: 'legacy', type: 'highlight', target: '#convention-only' },
    ]);
  });

  it('accepts the host top-level message shape in the fallback game bridge', () => {
    const fallback = buildFallbackGameWidget(
      {
        id: 'game-1',
        type: 'interactive',
        title: 'Fallback Game',
        description: 'Complete the challenge.',
        keyPoints: ['Observe the result'],
        order: 1,
        language: 'en-US',
        widgetType: 'game',
        widgetOutline: { gameTemplateId: 'puzzle-lab' },
      },
      { gameTemplateId: 'puzzle-lab' },
    );

    expect(fallback.html).toContain('if (event.source !== window.parent) return;');
    expect(fallback.html).toContain('const payload = message.payload || message;');
    for (const messageType of [
      'SET_WIDGET_STATE',
      'HIGHLIGHT_ELEMENT',
      'ANNOTATE_ELEMENT',
      'REVEAL_ELEMENT',
    ]) {
      expect(fallback.html).toContain(messageType);
    }
  });
});
