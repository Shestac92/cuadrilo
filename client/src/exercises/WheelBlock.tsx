import { angleAt, isSpinOver, itemAt, planSpin, type Spin } from '@cuadrilo/shared/wheel';
import { VisuallyHidden } from '@mantine/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '../i18n';
import { useRemoteWheel, type WheelController } from './wheelSync';

/** The wheel's geometry (the SVG's own units). */
const SIZE = 400;
const CENTER = SIZE / 2;
const RADIUS = 178;
/** Distinct colours, one per item (a wheel has at most 12 items, so no two neighbours share one). */
const COLORS = [
  'teal',
  'cyan',
  'blue',
  'indigo',
  'violet',
  'grape',
  'pink',
  'red',
  'orange',
  'yellow',
  'lime',
  'green',
] as const;
/** The light colours get a darker shade, so white text stays readable. */
const SHADE: Partial<Record<(typeof COLORS)[number], number>> = { orange: 7, yellow: 8, lime: 8 };

const point = (angle: number, radius: number) => {
  const radians = (angle * Math.PI) / 180;
  return `${(CENTER + radius * Math.sin(radians)).toFixed(2)} ${(CENTER - radius * Math.cos(radians)).toFixed(2)}`;
};

/** A pie slice from `from` to `to` degrees, clockwise from the top. */
const slice = (from: number, to: number) =>
  `M${CENTER} ${CENTER} L${point(from, RADIUS)} A${RADIUS} ${RADIUS} 0 ${to - from > 180 ? 1 : 0} 1 ${point(to, RADIUS)} Z`;

/** The length along the radius a label may take: from the rim in to the button in the middle. */
const LABEL_SPACE = RADIUS - 24 - 46;

/**
 * What fits on a segment: the text in at most two lines (cut short with "…" on the wheel; the full text is
 * shown below it), and the size of the letters by how many items share the wheel.
 */
function label(text: string, count: number): { lines: string[]; size: number } {
  const size = count <= 6 ? 16 : count <= 9 ? 14 : 12;
  const perLine = Math.floor(LABEL_SPACE / (size * 0.56));
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const raw of words) {
    const word = raw.length > perLine ? `${raw.slice(0, perLine - 1)}…` : raw;
    if (line && `${line} ${word}`.length > perLine) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  lines.push(line);
  if (lines.length > 2) {
    const rest = lines.slice(1).join(' ');
    return { lines: [lines[0], `${rest.slice(0, perLine - 1).trimEnd()}…`], size };
  }
  return { lines, size };
}

/** The wheel on its own, outside a class: this page spins it and keeps the spin. */
function useLocalWheel(count: number): WheelController {
  const [spin, setSpin] = useState<Spin | null>(null);
  const start = useCallback(() => setSpin((current) => planSpin(current?.to ?? 0, count, Date.now())), [count]);
  return { spin, now: Date.now, start, canStart: true };
}

/**
 * A wheel of fortune for speaking practice: spin it and the item under the
 * pointer (at 3 o'clock, where its text is level) is the one to talk about. The
 * system's "reduce motion" setting is deliberately not followed: the turning is
 * the point of the widget (a decision, for now). Nothing is answered or saved.
 * The items keep the order the teacher gave them.
 *
 * In a live class the spin is the server's (exercises/wheelSync.tsx): anyone
 * may spin, everyone sees the same turn, a page that opens the exercise later
 * finds the wheel where it is now. Otherwise this page spins by itself. Either
 * way the wheel is drawn from a `Spin` and a clock alone (shared/src/wheel.ts).
 */
export function WheelBlock({ id, items }: { id: string; items: string[] }) {
  const count = items.length;
  const local = useLocalWheel(count);
  const remote = useRemoteWheel(id);
  const { spin, now, start, canStart } = remote ?? local;
  /** The spin that has run to its end on this page (so a new spin is "turning" at once). */
  const [stopped, setStopped] = useState<Spin | null>(null);
  const rotor = useRef<SVGGElement>(null);
  const turning = spin !== null && stopped !== spin;

  const draw = useCallback(
    (angle: number) => rotor.current?.setAttribute('transform', `rotate(${angle} ${CENTER} ${CENTER})`),
    [],
  );

  useEffect(() => {
    if (!spin) return draw(0);
    let frame = 0;
    const tick = () => {
      const at = now();
      draw(angleAt(spin, at));
      if (isSpinOver(spin, at)) setStopped(spin);
      else frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [spin, now, draw]);

  const stoppedOn = spin !== null && stopped === spin ? itemAt(spin.to, count) : null;

  return (
    <div className="ex-wheel">
      <div className="ex-wheel-stage">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="ex-wheel-svg" aria-hidden>
          <g ref={rotor}>
            {items.map((item, i) => {
              const segment = 360 / count;
              const color = COLORS[i % COLORS.length];
              const middle = (i + 0.5) * segment;
              const { lines, size } = label(item, count);
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: the items keep their fixed order: the position is their identity.
                <g key={i}>
                  <path
                    d={slice(i * segment, (i + 1) * segment)}
                    fill={`var(--mantine-color-${color}-${SHADE[color] ?? 6})`}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                  <text
                    transform={`rotate(${middle - 90} ${CENTER} ${CENTER})`}
                    x={CENTER + RADIUS - 22}
                    y={CENTER}
                    textAnchor="end"
                    dominantBaseline="central"
                    className="ex-wheel-label"
                    fontSize={size}
                  >
                    {lines.map((line, n) => (
                      <tspan
                        // biome-ignore lint/suspicious/noArrayIndexKey: the lines of one label, in a fixed order.
                        key={n}
                        x={CENTER + RADIUS - 22}
                        dy={n === 0 ? (lines.length === 1 ? 0 : '-0.6em') : '1.2em'}
                      >
                        {line}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </g>
          {/* The pointer: fixed at 3 o'clock (POINTER_ANGLE), its tip over the rim. */}
          <polygon
            points={`${SIZE - 3},${CENTER - 16} ${SIZE - 3},${CENTER + 16} ${CENTER + RADIUS - 14},${CENTER}`}
            className="ex-wheel-pointer"
          />
        </svg>
        <button type="button" className="ex-wheel-hub" onClick={start} disabled={turning || !canStart}>
          {turning ? '…' : t('exercise.spin')}
        </button>
      </div>
      <div className="ex-wheel-result" role="status" aria-live="polite">
        {stoppedOn !== null ? (
          items[stoppedOn]
        ) : (
          <span className="ex-wheel-result-hint">{turning ? '…' : t('exercise.spinHint')}</span>
        )}
      </div>
      <VisuallyHidden>
        <ol>
          {items.map((item, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the items keep their fixed order: the position is their identity.
            <li key={i}>{item}</li>
          ))}
        </ol>
      </VisuallyHidden>
    </div>
  );
}
