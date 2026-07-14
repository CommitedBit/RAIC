// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('radix-ui', async () => {
  const React = await import('react');
  const element = (tag: string, state?: 'closed') =>
    function MockPrimitive({
      children,
      asChild: _asChild,
      ...props
    }: React.HTMLAttributes<HTMLElement> & {
      children?: React.ReactNode;
      asChild?: boolean;
    }) {
      if (tag === 'fragment') return React.createElement(React.Fragment, null, children);
      const Component = tag as React.ElementType;
      return React.createElement(
        Component,
        state ? { ...props, 'data-state': state } : props,
        children,
      );
    };

  return {
    Dialog: {
      Root: element('div'),
      Trigger: element('button'),
      Portal: element('fragment'),
      Close: element('fragment'),
      Overlay: element('div', 'closed'),
      Content: element('section', 'closed'),
      Title: element('h2'),
      Description: element('p'),
    },
  };
});

const mounted: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  while (mounted.length > 0) {
    const next = mounted.pop();
    if (!next) continue;
    await act(async () => next.root.unmount());
    next.container.remove();
  }
});

describe('Dialog close state', () => {
  it('hides and disables closed overlay and content while Radix unmounts them', async () => {
    const { Dialog, DialogContent, DialogDescription, DialogTitle } =
      await import('@/components/ui/dialog');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    mounted.push({ root, container });

    await act(async () => {
      root.render(
        createElement(
          Dialog,
          { open: false },
          createElement(
            DialogContent,
            null,
            createElement(DialogTitle, null, 'Closed dialog'),
            createElement(DialogDescription, null, 'Should not remain visible'),
          ),
        ),
      );
    });

    const overlay = container.querySelector('[data-slot="dialog-overlay"]');
    const content = container.querySelector('[data-slot="dialog-content"]');

    expect(overlay?.getAttribute('data-state')).toBe('closed');
    expect(content?.getAttribute('data-state')).toBe('closed');
    for (const element of [overlay, content]) {
      expect(element?.classList.contains('data-closed:invisible')).toBe(true);
      expect(element?.classList.contains('data-closed:pointer-events-none')).toBe(true);
    }
  });
});
