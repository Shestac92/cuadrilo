import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import { useWatchedStore } from './sync';

/** One exercise of a lesson: number, the task ("Completa los huecos") and its elements. */
export function Exercise({
  number,
  title,
  titleEditor,
  itemId,
  actions,
  flash,
  tag,
  highlighted,
  children,
}: {
  number: number;
  title: string;
  /** The task as a field (the teacher edits it): instead of the title. */
  titleEditor?: ReactNode;
  /** A mark after the title (student: "Tarea" for homework exercises). */
  tag?: ReactNode;
  /** Outlined (teacher: chosen for a homework). */
  highlighted?: boolean;
  /** Exercise id: anchor for scrolling (data-item-id) and position tracking. */
  itemId?: string;
  /** Extra controls in the header (teacher: "show to the student"). */
  actions?: ReactNode;
  /** Briefly highlighted (the teacher showed it to the student). */
  flash?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={`ex ${flash ? 'ex-flash' : ''} ${highlighted ? 'ex-highlighted' : ''}`} data-item-id={itemId}>
      <header className="ex-head">
        <span className="ex-number">{number}</span>
        {titleEditor || <h2 className="ex-title">{title}</h2>}
        {tag}
        {actions && <div className="ex-actions">{actions}</div>}
      </header>
      <div className="ex-body">{children}</div>
    </section>
  );
}

/**
 * Result of one answer (a gap, a pair, a sentence), checked as soon as it is
 * given: null — not answered or being edited; ok — correct and locked;
 * bad — wrong, still editable.
 */
export type ItemState = 'ok' | 'bad' | null;

const CELEBRATIONS = ['confetti', 'fireworks', 'comic', 'sparkles', 'balloons', 'glitter', 'disco'] as const;
type CelebrationKind = (typeof CELEBRATIONS)[number];

/** The one played last on this page: the next element that is all correct gets another one. */
let lastCelebration: CelebrationKind | null = null;

const pickFrom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

function pickCelebration(): CelebrationKind {
  lastCelebration = pickFrom(CELEBRATIONS.filter((kind) => kind !== lastCelebration));
  return lastCelebration;
}

/** Between min and max (decoration: positions, sizes, delays). */
const between = (min: number, max: number) => min + Math.random() * (max - min);

/** CSS custom properties for one piece (the animation itself is in exercises.css). */
const vars = (values: Record<string, string | number>) => values as CSSProperties;

const CONFETTI_PIECES = 24;
const SPARKS = 16;
const DECOR_COLORS = ['#2f6fed', '#f59f00', '#2f9e44', '#e64980', '#7048e8', '#1098ad', '#f03e3e'];

/**
 * Pure-CSS celebration over the element when all its answers are correct
 * (exercises.css): confetti, fireworks, a comic-book word, sparkles,
 * balloons, falling glitter or a disco ball, picked at random and never the
 * same twice in a row. Mounted once, plays once (also with the system's
 * reduced-motion setting). The student answering sees it when the element is
 * done; the teacher watching a student only when that student completes it
 * live, not for answers loaded with the page or on switching students.
 */
export function Celebration({ blockId, done }: { blockId: string; done: boolean }) {
  const watched = useWatchedStore();
  const [played, setPlayed] = useState(false);
  const before = useRef({ watched, done });
  useEffect(() => {
    const was = before.current;
    before.current = { watched, done };
    if (!watched) return;
    if (!done) setPlayed(false);
    else if (!was.done && was.watched === watched && watched.isLive(blockId)) setPlayed(true);
  }, [watched, done, blockId]);
  if (watched === undefined) return done ? <CelebrationShow /> : null;
  return done && played ? <CelebrationShow /> : null;
}

function CelebrationShow() {
  const [kind] = useState(pickCelebration);
  if (kind === 'fireworks') return <Fireworks />;
  if (kind === 'comic') return <ComicWord />;
  if (kind === 'sparkles') return <Sparkles />;
  if (kind === 'balloons') return <Balloons />;
  if (kind === 'glitter') return <Glitter />;
  if (kind === 'disco') return <DiscoBall />;
  return (
    <div className="ex-confetti" aria-hidden>
      {Array.from({ length: CONFETTI_PIECES }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical decorative pieces.
        <span key={i} />
      ))}
    </div>
  );
}

/** Three rockets rise and burst into two rings of sparks with a flash, one after another. */
function Fireworks() {
  const [shots] = useState(() =>
    [18, 50, 82].map((x, i) => {
      const color = pickFrom(DECOR_COLORS);
      return {
        x: x + between(-8, 8),
        height: between(120, 190),
        delay: i * 300 + between(0, 120),
        color,
        // The inner ring: another colour.
        color2: pickFrom(DECOR_COLORS.filter((c) => c !== color)),
      };
    }),
  );
  return (
    <div className="ex-celebrate ex-fireworks" aria-hidden>
      {shots.map((shot, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list made once.
          key={i}
          className="ex-firework"
          style={vars({
            '--x': `${shot.x}%`,
            '--h': `${shot.height}px`,
            '--delay': `${shot.delay}ms`,
            '--c': shot.color,
          })}
        >
          <span className="ex-rocket" />
          {Array.from({ length: SPARKS }, (_, s) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: identical decorative pieces.
            <span key={s} className="ex-spark" style={vars({ '--a': `${(360 / SPARKS) * s}deg` })} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** A comic-book "BOOM!" on a starburst; the letters pop in one by one. */
function ComicWord() {
  const [word] = useState(() => pickFrom(t('exercise.celebrationWords').split('|')));
  const [tilt] = useState(() => pickFrom([-8, -5, 5, 8]));
  return (
    <div className="ex-celebrate ex-comic" aria-hidden data-no-translate>
      <div className="ex-comic-pop" style={vars({ '--tilt': `${tilt}deg` })}>
        <div className="ex-comic-burst" />
        <div className="ex-comic-word">
          {Array.from(word).map((letter, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the letters of a fixed word.
            <span key={i} style={vars({ '--i': i })}>
              {letter}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Four-pointed stars twinkle all over the element. */
function Sparkles() {
  const [stars] = useState(() =>
    Array.from({ length: 16 }, (_, i) => ({
      x: (i / 16) * 100 + between(0, 6),
      y: between(5, 90),
      size: between(20, 38),
      delay: between(0, 700),
      color: pickFrom(['#fab005', '#f59f00', '#4dabf7', '#e64980', '#7048e8']),
    })),
  );
  return (
    <div className="ex-celebrate ex-sparkles" aria-hidden>
      {stars.map((star, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list made once.
          key={i}
          style={vars({
            '--x': `${star.x}%`,
            '--y': `${star.y}%`,
            '--s': `${star.size}px`,
            '--delay': `${star.delay}ms`,
            '--c': star.color,
          })}
        />
      ))}
    </div>
  );
}

/** Balloons float up from the bottom, swaying on their strings. */
function Balloons() {
  const [balloons] = useState(() =>
    Array.from({ length: 7 }, (_, i) => ({
      x: 8 + i * 14 + between(-4, 4),
      delay: between(0, 600),
      duration: between(2200, 3000),
      scale: between(0.8, 1.15),
      color: DECOR_COLORS[i % DECOR_COLORS.length],
    })),
  );
  return (
    <div className="ex-celebrate ex-balloons" aria-hidden>
      {balloons.map((balloon, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list made once.
          key={i}
          className="ex-balloon"
          style={vars({
            '--x': `${balloon.x}%`,
            '--delay': `${balloon.delay}ms`,
            '--duration': `${balloon.duration}ms`,
            '--scale': balloon.scale,
            '--c': balloon.color,
          })}
        >
          <span />
        </span>
      ))}
    </div>
  );
}

/** ✓ / ✗ next to an answer. */

/** Glitter rains down over the element, glinting as the flakes turn. */
function Glitter() {
  const [flakes] = useState(() =>
    Array.from({ length: 46 }, () => ({
      x: between(0, 100),
      delay: between(0, 900),
      duration: between(1600, 2600),
      size: between(5, 10),
      drift: between(-40, 40),
      spin: pickFrom([1, -1]) * between(2, 5),
      color: pickFrom(['#fcc419', '#fab005', '#dee2e6', '#f783ac', '#74c0fc', '#b197fc']),
    })),
  );
  return (
    <div className="ex-celebrate ex-glitter" aria-hidden>
      {flakes.map((flake, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list made once.
          key={i}
          style={vars({
            '--x': `${flake.x}%`,
            '--delay': `${flake.delay}ms`,
            '--duration': `${flake.duration}ms`,
            '--s': `${flake.size}px`,
            '--drift': `${flake.drift}px`,
            '--spin': `${flake.spin}turn`,
            '--c': flake.color,
          })}
        />
      ))}
    </div>
  );
}

const BEAM_COLORS = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ff922b', '#3bc9db', '#f783ac'];

/**
 * A disco ball drops in over the element, which goes dim; the ball turns,
 * glints and sweeps coloured beams of light around, then it all fades.
 */
function DiscoBall() {
  const [beams] = useState(() =>
    BEAM_COLORS.map((color, i) => ({
      angle: -80 + (160 / (BEAM_COLORS.length - 1)) * i + between(-6, 6),
      swing: between(14, 30) * (i % 2 ? 1 : -1),
      duration: between(700, 1100),
      color,
    })),
  );
  return (
    <div className="ex-celebrate ex-disco" aria-hidden>
      <div className="ex-disco-beams">
        {beams.map((beam, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a fixed list made once.
            key={i}
            style={vars({
              '--a': `${beam.angle}deg`,
              '--swing': `${beam.swing}deg`,
              '--duration': `${beam.duration}ms`,
              '--c': beam.color,
            })}
          />
        ))}
      </div>
      <div className="ex-disco-ball">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
