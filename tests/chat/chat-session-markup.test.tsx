import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { ChatSession } from '@/lib/types/chat';

vi.mock('motion/react', async () => {
  const React = await import('react');
  return {
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement('div', props, children),
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
        React.createElement('button', props, children),
    },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

vi.mock('@/lib/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/store/user-profile', () => ({
  useUserProfileStore: (selector: (state: { avatar: string }) => unknown) =>
    selector({ avatar: '' }),
}));

vi.mock('@/components/ui/avatar-display', async () => {
  const React = await import('react');
  return {
    AvatarDisplay: () => React.createElement('span', { 'data-testid': 'avatar' }),
  };
});

vi.mock('@/components/chat/inline-action-tag', async () => {
  const React = await import('react');
  return {
    InlineActionTag: () => React.createElement('span', { 'data-testid': 'action' }),
  };
});

import { ChatSessionComponent } from '@/components/chat/chat-session';

describe('ChatSessionComponent', () => {
  it('preserves line breaks in message text', () => {
    const session: ChatSession = {
      id: 'session-1',
      type: 'lecture',
      title: 'Lesson',
      status: 'active',
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'first line\nsecond line' }],
          metadata: { senderName: 'Teacher', originalRole: 'teacher' },
        },
      ],
      config: { agentIds: [], maxTurns: 1, currentTurn: 0 },
      toolCalls: [],
      pendingToolCalls: [],
      createdAt: 1,
      updatedAt: 1,
    };

    const markup = renderToStaticMarkup(
      createElement(ChatSessionComponent, { session, isActive: true }),
    );

    expect(markup).toContain('whitespace-pre-wrap');
    expect(markup).toContain('first line\nsecond line');
  });
});
