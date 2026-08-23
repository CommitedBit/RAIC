import 'server-only';

import type { NextRequest } from 'next/server';

function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function getCanonicalRequestOrigin(request: NextRequest): string | null {
  const configuredBaseUrl = process.env.APP_BASE_URL?.trim();
  if (configuredBaseUrl) return parseOrigin(configuredBaseUrl);
  return parseOrigin(request.url);
}

function isHostedProduction() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
}

export function isSameOriginMutationRequest(request: NextRequest): boolean {
  const expectedOrigin = getCanonicalRequestOrigin(request);
  if (!expectedOrigin) return false;

  const origin = request.headers.get('origin')?.trim();
  if (origin) return parseOrigin(origin) === expectedOrigin;

  const referer = request.headers.get('referer')?.trim();
  if (referer) return parseOrigin(referer) === expectedOrigin;

  return !isHostedProduction();
}
