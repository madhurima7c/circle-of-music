'use client';

import { useSyncExternalStore } from 'react';

/**
 * Phone detection — TRUE at phone widths (≤ 640px, matching the MOBILE_*
 * swap). The instrument pages render the PhoneIntro preview instead of the
 * squeezed tool; tablets and up keep the full experience.
 *
 * useSyncExternalStore keeps hydration clean: the server snapshot says
 * "desktop", and phones re-render to the intro immediately after hydration.
 */

const QUERY = '(max-width: 640px)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  // Belt & braces: hidden/emulated tabs can defer mq change events; resize
  // always fires. useSyncExternalStore dedupes identical snapshots.
  window.addEventListener('resize', onChange);
  return () => {
    mq.removeEventListener('change', onChange);
    window.removeEventListener('resize', onChange);
  };
}

export function usePhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
