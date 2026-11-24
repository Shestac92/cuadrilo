/** Pure helpers of the block forms (tested in client/test/editor.test.ts). */

/**
 * "Hacer hueco": the selected words become a gap (`*…*`, spaces around the
 * selection stay outside). Without a selection an empty `**` goes in, with the
 * cursor inside. → the new text and where the cursor goes.
 */
export function makeGap(text: string, selectionStart: number, selectionEnd: number): { text: string; cursor: number } {
  const selected = text.slice(selectionStart, selectionEnd);
  const start = selectionStart + (selected.length - selected.trimStart().length);
  const end = Math.max(start, selectionEnd - (selected.length - selected.trimEnd().length));
  const next = `${text.slice(0, start)}*${text.slice(start, end)}*${text.slice(end)}`;
  return { text: next, cursor: start === end ? start + 1 : end + 2 };
}
