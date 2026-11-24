import { useEffect, useRef } from 'react';

const SCROLL_CHECK_MS = 300;

/**
 * Calls onChange with the ids of the items the student sees, in page order:
 * those with a noticeable part in the viewport (a quarter of the item, but at
 * most VISIBLE_PX). Nothing noticeable (an item taller than the screen between
 * two edges): the last item whose top is above 40% of the viewport, or the
 * first one. Items are the elements with data-item-id inside the container.
 */
const VISIBLE_PX = 150;

export function useVisibleItem(container: HTMLElement | null, key: unknown, onChange: (itemIds: string[]) => void) {
  const callback = useRef(onChange);
  callback.current = onChange;

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` (the chapter) changes the elements to watch.
  useEffect(() => {
    if (!container) return;
    let last: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      timer = undefined;
      const items = [...container.querySelectorAll<HTMLElement>('[data-item-id]')];
      const seen = items.filter((el) => {
        const { top, bottom, height } = el.getBoundingClientRect();
        const shown = Math.min(bottom, window.innerHeight) - Math.max(top, 0);
        return shown >= Math.min(height * 0.25, VISIBLE_PX);
      });
      if (seen.length === 0) {
        const line = window.innerHeight * 0.4;
        const current = items.filter((el) => el.getBoundingClientRect().top <= line).pop() ?? items[0];
        if (current) seen.push(current);
      }
      const ids = seen.map((el) => el.dataset.itemId as string);
      const signature = ids.join(',');
      if (signature !== last) {
        last = signature;
        callback.current(ids);
      }
    };
    const schedule = () => {
      timer ??= setTimeout(check, SCROLL_CHECK_MS);
    };
    check();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      clearTimeout(timer);
    };
    // key: re-check when the chapter changes.
  }, [container, key]);
}

/** How far below the top of the window the item is put, px. */
const SCROLL_TOP_GAP = 80;
/** How long after the call the target is re-checked, ms: pictures and other content above it may still be loading. */
const SCROLL_SETTLE_MS = 3000;
/** The target is moved again only when it is off by more than this, px. */
const SCROLL_SLACK = 2;

/** Ends the follow-up of the scroll in progress, if there is one. */
let stopFollowing: (() => void) | undefined;

/**
 * Scrolls the page so the lesson item is near the top.
 *
 * The page can grow above the item while the scroll runs (lazy pictures load as they come near), which moves
 * the item further down than the place worked out at the start: a single smooth scroll then stops half way. So
 * for a few seconds the target is worked out again on every frame and the scroll is aimed anew when it moved.
 * A wheel, touch or key press by the person stops this at once.
 */
export function scrollToItem(itemId: string) {
  // A newer call takes over: two of them would pull the page two ways.
  stopFollowing?.();
  const find = () => document.querySelector<HTMLElement>(`[data-item-id="${CSS.escape(itemId)}"]`);
  const targetOf = (el: HTMLElement) => Math.max(0, window.scrollY + el.getBoundingClientRect().top - SCROLL_TOP_GAP);

  const first = find();
  if (!first) return;
  let target = targetOf(first);
  window.scrollTo({ top: target, behavior: 'smooth' });

  const started = performance.now();
  let frame = 0;
  const stop = () => {
    if (stopFollowing === stop) stopFollowing = undefined;
    cancelAnimationFrame(frame);
    for (const type of ['wheel', 'touchstart', 'keydown', 'mousedown'] as const) window.removeEventListener(type, stop);
  };
  const follow = (now: number) => {
    const el = find();
    if (!el || now - started > SCROLL_SETTLE_MS) return stop();
    const next = targetOf(el);
    if (Math.abs(next - target) > SCROLL_SLACK) {
      target = next;
      window.scrollTo({ top: target, behavior: 'smooth' });
    }
    frame = requestAnimationFrame(follow);
  };
  for (const type of ['wheel', 'touchstart', 'keydown', 'mousedown'] as const) {
    window.addEventListener(type, stop, { passive: true, once: true });
  }
  stopFollowing = stop;
  frame = requestAnimationFrame(follow);
}
