import { useSyncExternalStore } from 'react';

import { COMPACT_QUERY, MOBILE_QUERY } from './viewport';

const mobile = window.matchMedia(MOBILE_QUERY);
const compact = window.matchMedia(COMPACT_QUERY);

// Styles cannot read a TypeScript constant: the document carries the answer (`html[data-viewport="mobile"]`).
// Registered first, so it is set before any component re-renders on a change.
const mark = () => {
  document.documentElement.dataset.viewport = mobile.matches ? 'mobile' : 'desktop';
};
mark();
mobile.addEventListener('change', mark);

const watch = (query: MediaQueryList) => {
  const subscribe = (onChange: () => void) => {
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  };
  return () =>
    useSyncExternalStore(
      subscribe,
      () => query.matches,
      () => false,
    );
};

/** True on a phone-width window. The only place that decides it (see `viewport.ts`). */
export const useIsMobile = watch(mobile);

/** True on a window too narrow for the full menu beside a lesson (menu density only, see `viewport.ts`). */
export const useIsCompact = watch(compact);
