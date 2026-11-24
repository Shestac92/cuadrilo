import { isTextColor, type TextColor } from '@cuadrilo/shared/textColors';

/**
 * Colours for the text block's editor: the teacher selects words and picks a
 * colour, and the Markdown (`:red[words]`, see lesson/remarkTextColor.ts) is
 * written for them. Pure: the text and the selection in, the new ones out.
 */

export interface Edit {
  text: string;
  /** The selection after the change. */
  start: number;
  end: number;
}

interface Colored {
  /** Where `:name[` begins. */
  from: number;
  name: TextColor;
  /** The words: after `[` up to `]`. */
  open: number;
  close: number;
}

/** The colour directives of the text, with their brackets matched (nested ones too). */
function coloredParts(text: string): Colored[] {
  const found: Colored[] = [];
  for (const match of text.matchAll(/:([a-z]+)\[/g)) {
    if (!isTextColor(match[1])) continue;
    const open = match.index + match[0].length;
    let depth = 1;
    let close = open;
    for (; close < text.length && depth > 0; close++) {
      if (text[close] === '[') depth++;
      else if (text[close] === ']') depth--;
    }
    if (depth === 0) found.push({ from: match.index, name: match[1], open, close: close - 1 });
  }
  return found;
}

/** The innermost coloured part the selection is in. */
function partAround(text: string, start: number, end: number): Colored | undefined {
  return coloredParts(text)
    .filter((p) => p.open <= start && end <= p.close)
    .sort((a, b) => b.open - a.open)[0];
}

/** A line's list / heading / quote marker stays outside the colour; table cells are coloured one by one. */
function colorLine(line: string, color: TextColor): string {
  // The row of dashes under a table's header is not text.
  if (/^\s*\|?(?:\s*:?-+:?\s*\|)+(?:\s*:?-+:?\s*)?$/.test(line)) return line;
  const [, marker = '', rest = ''] = line.match(/^(\s*(?:[-*+]|\d+\.|#{1,6}|>)\s+)?(.*)$/s) ?? [];
  const wrap = (words: string) => {
    const lead = words.match(/^\s*/)?.[0] ?? '';
    const trail = words.trimEnd().length < words.length ? (words.match(/\s*$/)?.[0] ?? '') : '';
    const core = words.trim();
    return core ? `${lead}:${color}[${core}]${trail}` : words;
  };
  return marker + (rest.includes('|') ? rest.split('|').map(wrap).join('|') : wrap(rest));
}

/**
 * Colours the selected words (each line, so lists, headings and tables survive).
 * Nothing selected: a placeholder is put in, selected, to be typed over. The
 * selection is a whole coloured part (or the cursor is in one): that part
 * changes its colour instead of nesting a new one.
 */
export function colorText(text: string, start: number, end: number, color: TextColor, placeholder: string): Edit {
  const around = partAround(text, start, end);
  if (around && (start === end || (start === around.open && end === around.close))) {
    const next = `${text.slice(0, around.from)}:${color}[${text.slice(around.open)}`;
    const shift = color.length - around.name.length;
    return { text: next, start: start + shift, end: end + shift };
  }
  const selected = start === end ? placeholder : text.slice(start, end);
  const colored = selected
    .split('\n')
    .map((line) => colorLine(line, color))
    .join('\n');
  const next = text.slice(0, start) + colored + text.slice(end);
  // Whole when one coloured piece; the words only when it is the placeholder.
  return { text: next, start, end: start + colored.length };
}

/** Takes the colour off: the coloured part the selection (or the cursor) is in, if any. */
export function uncolorText(text: string, start: number, end: number): Edit | undefined {
  const around = partAround(text, start, end);
  if (!around) return undefined;
  const words = text.slice(around.open, around.close);
  const next = text.slice(0, around.from) + words + text.slice(around.close + 1);
  const lost = around.open - around.from;
  return { text: next, start: Math.max(around.from, start - lost), end: Math.max(around.from, end - lost) };
}
