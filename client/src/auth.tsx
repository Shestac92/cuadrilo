import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { ApiError, api, type CurrentUser, setUnauthorizedHandler } from './api';

interface AuthState {
  /** undefined while the session is being checked, null when signed out. */
  user: CurrentUser | null | undefined;
  /** Signed out by the server while using the app (the session expired or was revoked). */
  expired: boolean;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>();
  const [expired, setExpired] = useState(false);
  const setUser = useCallback((u: CurrentUser | null) => {
    setUserState(u);
  }, []);

  useEffect(() => {
    // A 401 inside the app: the session ended (expired, password changed, signed out elsewhere).
    setUnauthorizedHandler(() => {
      setExpired(true);
      setUser(null);
    });
    api.me().then(setUser, (e: unknown) => {
      setUser(null);
      if (!(e instanceof ApiError && e.status === 401)) console.error(e);
    });
  }, [setUser]);

  const login = useCallback(
    async (login: string, password: string) => {
      setUser(await api.login(login, password));
      setExpired(false);
    },
    [setUser],
  );

  const logout = useCallback(async () => {
    await api.logout().catch(() => {});
    setUser(null);
  }, [setUser]);

  return <AuthContext.Provider value={{ user, expired, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Signed-in user; only for pages rendered after the sign-in check (see App). */
export function useUser(): CurrentUser {
  const { user } = useAuth();
  if (!user) throw new Error('useUser called while signed out');
  return user;
}

/** Random password for new students (shown to the teacher once). */
export function generatePassword(length = 12): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // Rejection sampling: no modulo bias.
  const limit = 256 - (256 % alphabet.length);
  let result = '';
  while (result.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length))) {
      if (b < limit && result.length < length) result += alphabet[b % alphabet.length];
    }
  }
  return result;
}
