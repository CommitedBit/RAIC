'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 767px)';
const serverSnapshot = () => false;
const snapshot = () => typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
function subscribe(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function useNarrowClassroom() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
