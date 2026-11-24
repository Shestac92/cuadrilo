/** Small helpers for Sets and Maps. Sets kept in React state are replaced, never changed in place. */

/** A copy of the set with the value in it (`include`), out of it, or switched over (no `include`). */
export function withToggled<T>(set: ReadonlySet<T>, value: T, include = !set.has(value)): Set<T> {
  const next = new Set(set);
  if (include) next.add(value);
  else next.delete(value);
  return next;
}

/** The map's value for the key, created and stored first if there is none yet. */
export function getOrCreate<K, V>(map: Map<K, V>, key: K, create: () => V): V {
  let value = map.get(key);
  if (value === undefined) {
    value = create();
    map.set(key, value);
  }
  return value;
}
