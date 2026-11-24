/**
 * Answers saved while "Mostrar solución" existed: a gap, pair or sentence it
 * filled in has the state 'solution' (a placement also has `solution: true`).
 * Such an answer is shown unchecked now (the placement's slots, whose words
 * are the right ones, are simply right); everything else stays as saved.
 */
export function forgetSolution(state: unknown): unknown {
  if (!state || typeof state !== 'object') return state;
  const saved = state as Record<string, unknown>;
  const { solution: _flag, ...rest } = saved;
  const forget = (value: unknown) => (value === 'solution' ? null : value);
  return {
    ...rest,
    ...(Array.isArray(saved.states) && { states: saved.states.map(forget) }),
    ...('state' in saved && { state: forget(saved.state) }),
  };
}
