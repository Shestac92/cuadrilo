/**
 * Colours of text in a text block (Markdown): `:red[words]`. A fixed palette,
 * the names of Mantine's colours, so the page picks the shade that reads well
 * on the current background. Anything else after the colon stays plain text.
 */
export const TEXT_COLORS = [
  'gray',
  'red',
  'pink',
  'grape',
  'violet',
  'indigo',
  'blue',
  'cyan',
  'teal',
  'green',
  'lime',
  'orange',
] as const;
export type TextColor = (typeof TEXT_COLORS)[number];

export const isTextColor = (name: string): name is TextColor => (TEXT_COLORS as readonly string[]).includes(name);
