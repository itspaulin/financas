import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type { Member } from '@/shared/types';

import { api, setSession, tokenStore } from './api';

type AuthState = {
  ready: boolean;
  signedIn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export type SignUpInput = { name: string; email: string; password: string; inviteCode?: string; householdName?: string };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  const clear = useCallback(async () => {
    setSession(null, null);
    setToken(null);
    await tokenStore.set(null);
  }, []);

  const adopt = useCallback(
    (value: string | null) => {
      setSession(value, () => void clear());
      setToken(value);
    },
    [clear],
  );

  useEffect(() => {
    tokenStore.get().then((stored) => {
      adopt(stored);
      setReady(true);
    });
  }, [adopt]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      const result = await api<{ token: string; member: Member }>('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      await tokenStore.set(result.token);
      adopt(result.token);
    },
    [adopt],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const result = await api<{ token: string; member: Member }>('/auth/register', { method: 'POST', body: input });
      await tokenStore.set(result.token);
      adopt(result.token);
    },
    [adopt],
  );

  const deleteAccount = useCallback(
    async (password: string) => {
      await api('/auth/delete-account', { method: 'POST', body: { password } });
      await clear();
    },
    [clear],
  );

  const signOut = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    await clear();
  }, [clear]);

  const value = useMemo(
    () => ({ ready, signedIn: token !== null, signIn, signUp, deleteAccount, signOut }),
    [ready, token, signIn, signUp, deleteAccount, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}
