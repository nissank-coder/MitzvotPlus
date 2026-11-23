import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { localDateKey } from '../lib/dates';
import { ActionKey, AppSettings, AppState, BlessingCategory, IconName } from '../types';
import { computeDerived, Derived } from './derived';
import { createFreshState, loadState, reducer, STORAGE_KEY } from './state';

type StoreValue = {
  state: AppState;
  derived: Derived;
  hydrated: boolean;
  completeOnboarding: (userName: string, dailyGoal: number) => void;
  addMitzvah: (title: string, icon: IconName, points: number, actionKey?: ActionKey) => void;
  addBlessing: (category: BlessingCategory, title?: string) => void;
  removeLog: (id: string) => void;
  resetSpeech: () => void;
  toggleTorahSaved: () => void;
  completeTorah: () => void;
  setReflection: (value: string) => void;
  updateGoals: (goals: Partial<Pick<AppState, 'dailyGoal' | 'weeklyGoal' | 'blessingGoal' | 'userName'>>) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  toggleGroup: (key: string) => void;
  loadDemo: () => void;
  resetAll: () => void;
};

const AppStoreContext = createContext<StoreValue | null>(null);

/** Re-renders when the local date changes, so "today" rolls over at midnight without reloading. */
function useTodayKey(): string {
  const [todayKey, setTodayKey] = useState(() => localDateKey());
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = localDateKey();
      setTodayKey((prev) => (prev === next ? prev : next));
    }, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return todayKey;
}

export function AppStoreProvider({ children }: PropsWithChildren): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, () => createFreshState());
  const [hydrated, setHydrated] = useState(false);
  const todayKey = useTodayKey();

  useEffect(() => {
    try {
      dispatch({ type: 'hydrate', payload: loadState(window.localStorage.getItem(STORAGE_KEY)) });
    } catch (error) {
      console.warn('Could not load app data', error);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Could not save app data', error);
    }
  }, [hydrated, state]);

  const derived = useMemo(() => computeDerived(state, todayKey), [state, todayKey]);

  const value = useMemo<StoreValue>(
    () => ({
      state,
      derived,
      hydrated,
      completeOnboarding: (userName, dailyGoal) => dispatch({ type: 'completeOnboarding', payload: { userName, dailyGoal } }),
      addMitzvah: (title, icon, points, actionKey) =>
        dispatch({ type: 'addMitzvah', payload: { title, icon, points, actionKey } }),
      addBlessing: (category, title) => dispatch({ type: 'addBlessing', payload: { category, title } }),
      removeLog: (id) => dispatch({ type: 'removeLog', payload: { id } }),
      resetSpeech: () => dispatch({ type: 'resetSpeech' }),
      toggleTorahSaved: () => dispatch({ type: 'toggleTorahSaved' }),
      completeTorah: () => dispatch({ type: 'completeTorah' }),
      setReflection: (text) => dispatch({ type: 'setReflection', payload: { dateKey: todayKey, text } }),
      updateGoals: (goals) => dispatch({ type: 'updateGoals', payload: goals }),
      updateSettings: (settings) => dispatch({ type: 'updateSettings', payload: settings }),
      toggleGroup: (key) => dispatch({ type: 'toggleGroup', payload: { key } }),
      loadDemo: () => dispatch({ type: 'loadDemo' }),
      resetAll: () => dispatch({ type: 'resetAll' }),
    }),
    [derived, hydrated, state, todayKey],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}
