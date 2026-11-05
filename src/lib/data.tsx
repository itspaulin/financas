import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { addMonths, monthOf, today } from '@/shared/dates';
import type { Draft, Lookups } from '@/shared/types';

import { api } from './api';

type AppData = {
  lookups: Lookups | null;
  lookupsError: string | null;
  reloadLookups: () => Promise<void>;
  month: string;
  setMonth: (month: string) => void;
  shiftMonth: (delta: number) => void;
  version: number;
  changed: () => void;
};

const AppDataContext = createContext<AppData | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [lookupsError, setLookupsError] = useState<string | null>(null);
  const [month, setMonth] = useState(() => monthOf(today()));
  const [version, setVersion] = useState(0);

  const reloadLookups = useCallback(async () => {
    try {
      setLookups(await api<Lookups>('/lookups'));
      setLookupsError(null);
    } catch (error) {
      setLookupsError(error instanceof Error ? error.message : 'Erro ao carregar');
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<Lookups>('/lookups')
      .then((result) => active && setLookups(result))
      .catch((error: unknown) => active && setLookupsError(error instanceof Error ? error.message : 'Erro ao carregar'));
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AppData>(
    () => ({
      lookups,
      lookupsError,
      reloadLookups,
      month,
      setMonth,
      shiftMonth: (delta) => setMonth((m) => addMonths(m, delta)),
      version,
      changed: () => setVersion((v) => v + 1),
    }),
    [lookups, lookupsError, reloadLookups, month, version],
  );
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppData {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData outside AppDataProvider');
  return value;
}

export function useRemote<T>(path: string | null) {
  const { version } = useAppData();
  const [tick, setTick] = useState(0);
  const key = `${path}|${version}|${tick}`;
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null }>({
    key: '',
    data: null,
    error: null,
  });

  useEffect(() => {
    if (!path) return;
    let active = true;
    api<T>(path)
      .then((data) => active && setState({ key, data, error: null }))
      .catch(
        (e: unknown) =>
          active && setState((s) => ({ key, data: s.data, error: e instanceof Error ? e.message : 'Erro ao carregar' })),
      );
    return () => {
      active = false;
    };
  }, [path, key]);

  return {
    data: state.data,
    error: state.error,
    loading: Boolean(path) && state.key !== key,
    reload: () => setTick((t) => t + 1),
  };
}

let pendingDraft: Draft | null = null;

export const draftStore = {
  put(draft: Draft) {
    pendingDraft = draft;
  },
  take(): Draft | null {
    const draft = pendingDraft;
    pendingDraft = null;
    return draft;
  },
};
