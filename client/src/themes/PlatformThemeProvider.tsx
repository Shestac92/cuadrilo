import { MantineProvider } from '@mantine/core';
import { type ReactNode, useEffect, useState } from 'react';

import { useConfig } from '../config';
import { cacheTheme, pickTheme, readCachedTheme } from './choice';
import { themes } from './index';

/** The theme the platform shows now (see pickTheme). */
export function useThemeId() {
  const config = useConfig();
  const [cached] = useState(readCachedTheme);
  return pickTheme(config?.theme, cached);
}

/** Mantine with the platform's theme: the teachers' choice, for everyone. A change applies at once, without a reload. */
export function PlatformThemeProvider({ children }: { children: ReactNode }) {
  const id = useThemeId();
  const serverTheme = useConfig()?.theme;
  useEffect(() => {
    if (serverTheme) cacheTheme(serverTheme);
  }, [serverTheme]);
  const { theme, variables, lightOnly } = themes[id];
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={variables}
      defaultColorScheme="light"
      forceColorScheme={lightOnly ? 'light' : undefined}
    >
      {children}
    </MantineProvider>
  );
}
