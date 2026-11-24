import { IconChevronsDown, IconChevronsUp } from '@tabler/icons-react';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { t } from '../i18n';
import { useIsMobile } from '../layout/useIsMobile';

/** How the board draws itself: 'full' is the open feed (the column, the open sheet), 'bar' the collapsed sheet (one line). */
export type BoardChrome = 'full' | 'bar';

export type DockLayout = 'column' | 'sheet';

interface SideMode {
  layout: DockLayout;
  mode: BoardChrome;
  /** Opens the sheet. */
  expand: () => void;
  /** Closes the sheet. */
  collapse: () => void;
}

const SideModeContext = createContext<SideMode>({
  layout: 'column',
  mode: 'full',
  expand: () => {},
  collapse: () => {},
});

/** What the cards of the side column should show. */
export const useSideMode = () => useContext(SideModeContext);

/** How the sheet moves from one height to the next. */
const SHEET_GLIDE_MS = 320;
const SHEET_GLIDE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** A trackpad or a wheel notch, in pixels. */
const wheelPixels = (event: WheelEvent, page: number) => {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * page;
  return event.deltaY;
};

/**
 * The side column of a lesson page (the board, the students). On a desktop window it is a normal
 * column. On a phone (`layout/viewport.ts`) the board is a bottom sheet in the lesson's own area:
 * closed it is one line, open it is half of the screen and the lesson stays in view above it.
 * One button opens and closes it. The panel glides between the two heights. A wheel over the open
 * feed scrolls the feed, not the lesson. Always starts closed.
 */
export function SideDock({ children }: { children: ReactNode }) {
  const isSheet = useIsMobile();
  const layout: DockLayout = isSheet ? 'sheet' : 'column';

  const [open, setOpen] = useState(false);
  const sheet = open ? 'open' : 'collapsed';
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  // The panel's height before the state that is on screen now, so the next one can glide from it.
  const prevHeight = useRef<number | null>(null);
  const glide = useRef<Animation | null>(null);
  const [settling, setSettling] = useState(false);

  // A window that crosses the threshold (a phone turned sideways) starts closed.
  const layoutRef = useRef(layout);
  useEffect(() => {
    if (layoutRef.current === layout) return;
    layoutRef.current = layout;
    setOpen(false);
  }, [layout]);

  const collapse = useCallback(() => setOpen(false), []);
  const expand = useCallback(() => setOpen(true), []);

  const mode: BoardChrome = !isSheet || open ? 'full' : 'bar';

  // The page's styles ask for the phone dock by an attribute on <html> (the `:has()` on the root they used
  // makes the browser check the whole document at every change). Before the paint, so the first frame is right.
  useLayoutEffect(() => {
    if (!isSheet) return;
    const root = document.documentElement;
    root.dataset.dock = 'sheet';
    return () => {
      delete root.dataset.dock;
    };
  }, [isSheet]);

  // The room under the column's top edge: sticky keeps it at 72px once the page is scrolled, but at the
  // start of the page it sits lower (under the title and the tabs), and a height counted from the top of
  // the screen would push the end of the board out of view. Kept as `--side-room` (styles.css).
  useEffect(() => {
    const el = box.current;
    if (!el || isSheet) return;
    // A scroll event comes at every frame: write only when the value is new, or the page restyles at each one.
    let written = '';
    const update = () => {
      const room = `${Math.max(200, window.innerHeight - el.getBoundingClientRect().top - 16)}px`;
      if (room === written) return;
      written = room;
      el.style.setProperty('--side-room', room);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const observer = new ResizeObserver(update);
    observer.observe(document.body);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, [isSheet]);

  // How much of the bottom the sheet covers, so the lesson can scroll clear of it and a notice sits above it.
  useEffect(() => {
    const root = document.documentElement;
    const el = panel.current;
    const clear = () => {
      root.style.removeProperty('--sheet-cover');
    };
    if (!el || !isSheet) {
      clear();
      return;
    }
    let written = '';
    const apply = () => {
      // While the panel glides, its border box is the in-between height. The lesson clears the
      // height it is going to, or the page would reflow on every frame of the glide.
      const target = prevHeight.current;
      const gliding = glide.current?.playState === 'running' && target != null;
      const cover = `${gliding ? target : el.offsetHeight}px`;
      // Written only when new: this also runs at every scroll event.
      if (cover === written) return;
      written = cover;
      root.style.setProperty('--sheet-cover', cover);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    window.addEventListener('scroll', apply, { passive: true });
    window.addEventListener('resize', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      clear();
    };
  }, [isSheet]);

  // The on-screen keyboard covers a fixed sheet. Lift the panel by the hidden strip of the layout viewport.
  useEffect(() => {
    const vv = window.visualViewport;
    const el = panel.current;
    if (!vv || !el || !isSheet) return;
    let written = '';
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const margin = inset > 0 ? `${inset}px` : '';
      if (margin === written) return;
      written = margin;
      el.style.marginBottom = margin;
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      el.style.marginBottom = '';
    };
  }, [isSheet]);

  // The open feed takes the wheel. Otherwise a Mac trackpad over the board scrolls the lesson
  // behind it (the sheet used to cover the lesson with a layer that ignored the pointer).
  useEffect(() => {
    const el = panel.current;
    if (!el || !isSheet) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) return;
      const target = event.target;
      if (target instanceof Element && target.closest('.translator-popup')) return;
      const lines = el.querySelector<HTMLElement>('.board-lines');
      if (!lines) return;
      const max = lines.scrollHeight - lines.clientHeight;
      if (max <= 0) return;
      event.preventDefault();
      lines.scrollTop = Math.min(max, Math.max(0, lines.scrollTop + wheelPixels(event, lines.clientHeight)));
    };
    el.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => el.removeEventListener('wheel', onWheel, { capture: true });
  }, [isSheet]);

  // Glide from the height that was on screen to the snap just chosen. Cleanup keeps the height
  // the eye actually sees, so a second snap during the glide continues from there.
  useLayoutEffect(() => {
    const el = panel.current;
    // `sheet` is the snap. The height follows it, so the glide runs again when it changes.
    const active = isSheet ? sheet : null;
    if (!el || active == null) {
      prevHeight.current = el?.offsetHeight ?? null;
      setSettling(false);
      return;
    }
    const from = prevHeight.current;
    const to = el.offsetHeight;
    prevHeight.current = to;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (from == null || reduce || Math.abs(from - to) < 1) {
      setSettling(false);
      return;
    }
    setSettling(true);
    const anim = el.animate([{ height: `${from}px` }, { height: `${to}px` }], {
      duration: SHEET_GLIDE_MS,
      easing: SHEET_GLIDE_EASE,
      id: 'sheet-height',
    });
    glide.current = anim;
    let alive = true;
    const stop = () => {
      if (!alive || glide.current !== anim) return;
      glide.current = null;
      setSettling(false);
    };
    anim.onfinish = stop;
    anim.oncancel = stop;
    return () => {
      alive = false;
      if (glide.current === anim) prevHeight.current = el.offsetHeight;
      anim.cancel();
      if (glide.current === anim) glide.current = null;
    };
  }, [isSheet, sheet]);

  // A new line, or the window, changes the height without a new snap. Remember it, or the next glide starts from a stale one.
  useEffect(() => {
    if (!isSheet) return;
    const el = panel.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (glide.current?.playState === 'running') return;
      prevHeight.current = el.offsetHeight;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isSheet]);

  const value = useMemo(() => ({ layout, mode, expand, collapse }), [layout, mode, expand, collapse]);

  const columnClass = ['player-side', isSheet ? `sheet sheet-${sheet}` : ''].filter(Boolean).join(' ');

  const body = (
    <SideModeContext.Provider key="body" value={value}>
      {children}
    </SideModeContext.Provider>
  );

  // One tree for both layouts: the panel, its button and the cards always sit at the same places, so
  // a window resized across the threshold does not remount the board (the draft, the feed, the count).
  // On a desktop window the panel is `display: contents` and the button is not drawn.
  return (
    <div key="dock" ref={box} className={columnClass} data-dock={layout}>
      <div
        key="panel"
        ref={panel}
        className={isSheet ? (settling ? 'sheet-panel sheet-settling' : 'sheet-panel') : 'dock-flat'}
      >
        {isSheet ? (
          <button
            key="toggle"
            type="button"
            className="sheet-toggle"
            aria-label={open ? t('dock.close') : t('dock.open')}
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
            data-no-translate
          >
            {open ? <IconChevronsDown size={18} /> : <IconChevronsUp size={18} />}
          </button>
        ) : null}
        {body}
      </div>
    </div>
  );
}
