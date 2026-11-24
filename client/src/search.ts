/**
 * Client-side search: case, accents and stress marks don't matter ("собака"
 * finds "соба́ка", "arbol" finds "árbol", "leccion" finds "Lección").
 */
export const fold = (text: string) => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ё/g, 'е');

/** Whether `text` contains the query (folded; an empty query matches everything). */
export const matchesQuery = (text: string, query: string) => fold(text).includes(fold(query.trim()));
