import { Button, type CSSVariablesResolver, createTheme, type MantineColorsTuple } from '@mantine/core';

import { primarySegmentedControl, regularWeightControls } from './controlTypography';
import { SYSTEM_SANS } from './fonts';
import { sage } from './sage';

/** Soft pink: the primary colour. Shade 4 is the filled button, 7 the pink text on white. */
const blush: MantineColorsTuple = [
  '#fff5f8',
  '#ffe8ef',
  '#fed3e0',
  '#fbc9d6',
  '#f7acbc',
  '#f08fa8',
  '#e27592',
  '#c94a74',
  '#a63a5d',
  '#7d2c47',
];

/** Soft peach: the second colour (the apricot of the reference; badges, highlights, washes). */
const peach: MantineColorsTuple = [
  '#fff8f1',
  '#ffeedd',
  '#ffe0c2',
  '#ffcf9e',
  '#ffbf80',
  '#fbab63',
  '#f08f3f',
  '#d4742c',
  '#a85a22',
  '#7b411a',
];

/** Neutrals with a warm tint, so page backgrounds and borders sit well next to pink and peach. */
const warmGray: MantineColorsTuple = [
  '#fcf8f6',
  '#f6efec',
  '#ece2de',
  '#ded1cc',
  '#c5b6b0',
  '#a89893',
  '#8a7b77',
  '#6e615e',
  '#524845',
  '#3a3a3e',
];

/** Soft pink and white, peach as the second colour, sage as the shared green, pill buttons, no heavy shadows. */
export const blushTheme = createTheme({
  primaryColor: 'blush',
  primaryShade: { light: 4, dark: 5 },
  // Light fills (pastels) get dark text, the saturated ones white.
  autoContrast: true,
  colors: { blush, peach, sage, gray: warmGray },
  black: '#3a3a3e',
  fontFamily: SYSTEM_SANS,
  headings: { fontFamily: SYSTEM_SANS, fontWeight: '600' },
  defaultRadius: 'lg',
  radius: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '999px' },
  components: {
    ...regularWeightControls,
    ...primarySegmentedControl('blush'),
    Button: Button.extend({
      defaultProps: { radius: 'xl', autoContrast: false },
      styles: { root: { fontWeight: 400 } },
    }),
  },
});

/** What the theme object cannot say: borders, links and the page wash. */
export const blushVariables: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-default-border': '#f1dde3',
    '--mantine-color-anchor': '#c94a74',
    '--mantine-color-body': '#ffffff',
    // The page backdrop: white with a soft peach glow top left and a pink one top right.
    '--app-login-bg': 'transparent',
    '--app-backdrop':
      'radial-gradient(900px 420px at 12% -100px, #ffdcc2 0%, rgba(255, 220, 194, 0) 100%), radial-gradient(800px 400px at 92% -80px, #fccfe0 0%, rgba(252, 207, 224, 0) 100%)',
  },
  dark: {},
});
