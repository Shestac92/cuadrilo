import { Badge, Button, type MantineThemeOverride, SegmentedControl } from '@mantine/core';

/** Buttons and badges (tags): regular weight instead of Mantine's 600/700 defaults. */
export const regularWeightControls: MantineThemeOverride['components'] = {
  Button: Button.extend({ styles: { root: { fontWeight: 400 } } }),
  Badge: Badge.extend({ styles: { root: { fontWeight: 400 } } }),
};

/**
 * Segmented controls (Palabra / Traducción, Recientes / A–Z…): white track with
 * the same hairline as the board and outline buttons (no shadow), active pill
 * in the theme's primary colour with a white label. `primaryColor` is the
 * palette name (`blush`, `teal`).
 */
export function primarySegmentedControl(primaryColor: string): MantineThemeOverride['components'] {
  return {
    SegmentedControl: SegmentedControl.extend({
      defaultProps: {
        radius: 'xl',
        color: primaryColor,
        autoContrast: false,
      },
      styles: {
        root: {
          backgroundColor: 'light-dark(var(--mantine-color-white), var(--mantine-color-dark-6))',
          border: '1px solid var(--mantine-color-default-border)',
        },
        label: { fontWeight: 400 },
      },
    }),
  };
}
