// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scriptMockState = vi.hoisted(() => ({
  onLoad: null as null | (() => void),
}));

const routerMockState = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/script', async () => {
  const React = await import('react');
  return {
    default: ({ onLoad }: { onLoad?: () => void }) => {
      scriptMockState.onLoad = onLoad ?? null;
      return React.createElement(React.Fragment);
    },
  };
});

vi.mock('next/navigation', () => ({
  useRouter: () => routerMockState,
}));

vi.mock('@/components/ui/button', async () => {
  const React = await import('react');
  return {
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { children?: React.ReactNode }) =>
      React.createElement('button', props, children),
  };
});

const mountedRoots: Array<{ root: Root; container: HTMLDivElement }> = [];

async function mountButton() {
  const { GoogleSignInButton } = await import('@/components/auth/google-sign-in-button');

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push({ root, container });

  await act(async () => {
    root.render(createElement(GoogleSignInButton, { redirectTo: '/studio' }));
  });

  return { container };
}

describe('GoogleSignInButton', () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.unstubAllGlobals();
    vi.stubGlobal('fetch', vi.fn());
    scriptMockState.onLoad = null;
    routerMockState.push.mockReset();
    routerMockState.refresh.mockReset();
    delete (window as Window & { google?: unknown }).google;
    delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  });

  afterEach(async () => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) continue;

      await act(async () => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    delete (window as Window & { google?: unknown }).google;
  });

  it('shows a configuration warning when the public Google client id is missing', async () => {
    const { container } = await mountButton();

    expect(container.textContent).toContain('NEXT_PUBLIC_GOOGLE_CLIENT_ID is not configured yet.');
    expect(container.textContent).toContain('Authorized JavaScript origin');
  });

  it('shows a preparation state while the nonce request is pending', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise(() => {
            // keep pending
          }),
      ),
    );

    const { container } = await mountButton();

    expect(container.textContent).toContain('Preparing secure Google sign-in...');
  });

  it('shows a sober error state when nonce preparation fails', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to prepare Google sign-in');
      }),
    );

    const { container } = await mountButton();

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Failed to prepare Google sign-in');
    expect(container.textContent).toContain('exact authorized origins');
  });

  it('initializes Google sign-in with the popup callback flow', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id';
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (input === '/api/auth/nonce') {
        return Response.json({ nonce: 'nonce-123' });
      }
      if (input === '/api/auth/google') {
        return Response.json({ success: true, redirectTo: '/studio' });
      }
      return Response.json({ error: 'Unexpected request' }, { status: 500 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const initialize = vi.fn();
    const renderButton = vi.fn();
    Object.assign(window, {
      google: {
        accounts: {
          id: {
            initialize,
            renderButton,
          },
        },
      },
    });

    const { container } = await mountButton();

    await act(async () => {
      scriptMockState.onLoad?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: 'google-client-id',
        nonce: 'nonce-123',
        ux_mode: 'popup',
        use_fedcm_for_button: false,
        use_fedcm_for_prompt: false,
      }),
    );
    const initializeOptions = initialize.mock.calls[0]?.[0] as
      | { callback?: (response: { credential?: string }) => Promise<void> | void }
      | undefined;
    expect(initializeOptions?.callback).toEqual(expect.any(Function));
    expect(renderButton).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      expect.objectContaining({ text: 'signin_with' }),
    );

    await act(async () => {
      await initializeOptions?.callback?.({ credential: 'google-jwt' });
    });

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/auth/nonce', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/auth/google', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        credential: 'google-jwt',
        redirectTo: '/studio',
      }),
    });
    expect(routerMockState.push).toHaveBeenCalledWith('/studio');
    expect(routerMockState.refresh).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Google sign-in is limited');
  });
});
