import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { localStorageStorage, StateStorage } from '../storage/persistence';
import { ActionKey } from '../data/actions';
import { cityById, CityOption } from '../data/locations';
import { localDateKey } from '../lib/dates';
import {
  DayInfo,
  getDayInfo,
  getRestWindow,
  getZmanim,
  recentRestDays,
  RestWindow,
  ZmanimForDay,
} from '../lib/jewishCalendar';
import { ActionInput } from '../lib/scoring';
import { buildTodayPlan, PlanItem } from '../lib/todayPlan';
import { AppSettings, AppState, BlessingCategory, UserProfile } from '../types';
import { computeDerived, Derived } from './derived';
import { createFreshState, loadState, reducer } from './state';

export type ActionOptions = Omit<ActionInput, 'key' | 'now'>;

export type CalendarState = {
  now: Date;
  city: CityOption;
  day: DayInfo;
  zmanim: ZmanimForDay;
  rest: RestWindow;
  /** Shabbat / Yom Tov days that ended recently and were not filled in yet. */
  pendingBackfill: string[];
  plan: PlanItem[];
};

type StoreValue = {
  state: AppState;
  derived: Derived;
  calendar: CalendarState;
  hydrated: boolean;
  /** Set when stored data could not be read; saving is then disabled so nothing is overwritten. */
  storageError: string | null;
  storageKind: StateStorage['kind'] | null;
  /** Writes pending changes now (called when the app goes to the background). */
  flush: () => Promise<void>;
  /** Re-reads the clock (called when the app returns to the foreground). */
  refreshClock: () => void;
  completeOnboarding: (userName: string, dailyGoal: number, profile: Partial<UserProfile>) => void;
  addAction: (key: ActionKey, options?: ActionOptions) => void;
  addBlessing: (category: BlessingCategory, title?: string) => void;
  backfill: (inputs: Array<{ key: ActionKey; dateKey: string; title?: string }>, days: string[]) => void;
  removeLog: (id: string) => void;
  resetSpeech: () => void;
  toggleTorahSaved: () => void;
  completeTorah: () => void;
  setReflection: (value: string) => void;
  updateGoals: (goals: Partial<Pick<AppState, 'dailyGoal' | 'weeklyGoal' | 'blessingGoal' | 'userName'>>) => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  updateProfile: (profile: Partial<UserProfile>) => void;
  toggleTrack: (key: string) => void;
  toggleGroup: (key: string) => void;
  loadDemo: () => void;
  resetAll: () => void;
};

const AppStoreContext = createContext<StoreValue | null>(null);

/** Ticks every 30 seconds so "today", zmanim and Shabbat mode stay current without reloading. */
function useNow(): [Date, () => void] {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const refresh = useCallback(() => setNow(new Date()), []);
  return [now, refresh];
}

/** SQLite on iOS/Android, browser storage on the web. */
async function openStorage(): Promise<StateStorage> {
  if (Capacitor.isNativePlatform()) {
    const { openNativeSqlite } = await import('../storage/sqliteStorage');
    return openNativeSqlite();
  }
  return localStorageStorage();
}

export function AppStoreProvider({ children }: PropsWithChildren): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, () => createFreshState());
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const storageRef = useRef<StateStorage | null>(null);
  const latest = useRef(state);
  latest.current = state;
  const saveTimer = useRef<number | null>(null);
  const [now, refreshClock] = useNow();
  const todayKey = localDateKey(now);
  const minuteKey = Math.floor(now.getTime() / 60_000);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storage = await openStorage();
        const raw = await storage.load();
        if (cancelled) return;
        storageRef.current = storage;
        dispatch({ type: 'hydrate', payload: loadState(raw) });
      } catch (error) {
        console.warn('Could not load app data', error);
        if (!cancelled) setStorageError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flush = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const storage = storageRef.current;
    if (!storage) return;
    try {
      await storage.save(latest.current);
    } catch (error) {
      console.warn('Could not save app data', error);
    }
  }, []);

  // Debounced save; a failed load leaves storageRef empty, so stored data is never overwritten.
  useEffect(() => {
    if (!hydrated || !storageRef.current) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flush(), 250);
  }, [hydrated, state, flush]);

  const derived = useMemo(() => computeDerived(state, todayKey), [state, todayKey]);

  const city = cityById(state.profile.cityId);
  const dayAndZmanim = useMemo(
    () => ({ day: getDayInfo(todayKey, city.il), zmanim: getZmanim(todayKey, city) }),
    [todayKey, city],
  );
  const restInfo = useMemo(() => {
    const at = new Date(minuteKey * 60_000);
    return {
      rest: getRestWindow(at, todayKey, city),
      recent: recentRestDays(at, todayKey, city),
    };
  }, [minuteKey, todayKey, city]);

  const calendar = useMemo<CalendarState>(
    () => ({
      now,
      city,
      day: dayAndZmanim.day,
      zmanim: dayAndZmanim.zmanim,
      rest: restInfo.rest,
      pendingBackfill: restInfo.recent.filter((k) => !state.backfilledRestDays.includes(k)),
      plan: buildTodayPlan(dayAndZmanim.day, dayAndZmanim.zmanim, state.profile.gender, derived.todayLogs),
    }),
    [now, city, dayAndZmanim, restInfo, state.backfilledRestDays, state.profile.gender, derived.todayLogs],
  );

  const value = useMemo<StoreValue>(() => {
    const addAction = (key: ActionKey, options: ActionOptions = {}) => {
      const at = Date.now();
      const onTime =
        options.onTime ??
        (key === 'shacharit' && calendar.zmanim.sofZmanTfilla ? at <= calendar.zmanim.sofZmanTfilla.getTime() : undefined);
      dispatch({ type: 'addAction', payload: { ...options, key, onTime, now: at } });
    };
    return {
      state,
      derived,
      calendar,
      hydrated,
      storageError,
      storageKind: storageRef.current?.kind ?? null,
      flush,
      refreshClock,
      completeOnboarding: (userName, dailyGoal, profile) =>
        dispatch({ type: 'completeOnboarding', payload: { userName, dailyGoal, profile } }),
      addAction,
      addBlessing: (category, title) => addAction('blessing', { category, title }),
      backfill: (inputs, days) =>
        dispatch({
          type: 'addActions',
          payload: inputs.map((i) => ({ ...i, backfill: true, now: Date.now() })),
          markBackfilled: days,
        }),
      removeLog: (id) => dispatch({ type: 'removeLog', payload: { id } }),
      resetSpeech: () => dispatch({ type: 'resetSpeech' }),
      toggleTorahSaved: () => dispatch({ type: 'toggleTorahSaved' }),
      completeTorah: () => addAction('dailyTorah'),
      setReflection: (text) => dispatch({ type: 'setReflection', payload: { dateKey: todayKey, text } }),
      updateGoals: (goals) => dispatch({ type: 'updateGoals', payload: goals }),
      updateSettings: (settings) => dispatch({ type: 'updateSettings', payload: settings }),
      updateProfile: (profile) => dispatch({ type: 'updateProfile', payload: profile }),
      toggleTrack: (key) => dispatch({ type: 'toggleTrack', payload: { key } }),
      toggleGroup: (key) => dispatch({ type: 'toggleGroup', payload: { key } }),
      loadDemo: () => dispatch({ type: 'loadDemo' }),
      resetAll: () => dispatch({ type: 'resetAll' }),
    };
  }, [calendar, derived, hydrated, state, todayKey, storageError, flush, refreshClock]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}
