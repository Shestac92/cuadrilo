import type { ThemeId } from '@cuadrilo/shared/themes';
import type { CSSVariablesResolver, MantineThemeOverride } from '@mantine/core';

import { blushTheme, blushVariables } from './blush';
import { classicTheme } from './classic';

export interface PlatformTheme {
  theme: MantineThemeOverride;
  /** CSS variables beyond the theme object (borders, page backdrop). */
  variables?: CSSVariablesResolver;
  /** The theme has no dark variant: the page stays light whatever the user's mode. */
  lightOnly?: boolean;
  /** Three colours that show the theme in the picker: the main one, the second, the surface. */
  swatch: [string, string, string];
}

/** Every theme the teachers can choose (ids: shared/src/themes.ts). Add a theme: an id there and an entry here. */
export const themes: Record<ThemeId, PlatformTheme> = {
  classic: { theme: classicTheme, swatch: ['#12b886', '#e6fcf5', '#ffffff'] },
  blush: { theme: blushTheme, variables: blushVariables, lightOnly: true, swatch: ['#f7acbc', '#ffcf9e', '#ffffff'] },
};
