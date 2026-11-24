import type { ReactNode } from 'react';

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

const CONFETTI_PIECES = 24;

/**
 * Pure-CSS confetti burst over the element when all its answers are correct
 * (exercises.css). Mounted once, plays once. Only for the student answering:
 * not on the teacher's read-only view.
 */
export function Celebration({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="ex-confetti" aria-hidden>
      {Array.from({ length: CONFETTI_PIECES }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: identical decorative pieces.
        <span key={i} />
      ))}
    </div>
  );
}

/** ✓ / ✗ next to an answer. */
