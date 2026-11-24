import type { AppConfig } from '@cuadrilo/shared/api';
import { useSyncExternalStore } from 'react';

/** What the server says about this installation (GET /api/config); undefined until it answers. */
let config: AppConfig | undefined;
const listeners = new Set<() => void>();

export async function loadConfig(): Promise<AppConfig> {
  const loaded = (await (await fetch('/api/config')).json()) as AppConfig;
  config = loaded;
  for (const listener of listeners) listener();
  return loaded;
}

/** The server's answer changed by this client (a teacher chose another theme): every user of the config updates. */
export function updateConfig(change: Partial<AppConfig>): void {
  if (!config) return;
  config = { ...config, ...change };
  for (const listener of listeners) listener();
}

export const useConfig = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => config,
  );
