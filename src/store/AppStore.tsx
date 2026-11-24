import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { localStorageStorage, StateStorage } from '../storage/persistence';
import { SaveController, SaveStatus } from '../storage/saveController';
import { ActionKey } from '../data/actions';
import { cityById, CityOption } from '../data/locations';
import {
  calendarContextOf,
  cityDateKey,
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
  /** Current save state: an error is always shown to the user and retried. */
  saveStatus: SaveStatus;
  /** True when this action is known to be stored on the device. */
  isLogSaved: (id: string) => boolean;
  /** Retries a failed save now. */
  retrySave: () => Promise<boolean>;
  /** Writes pending changes now (called when the app goes to the background). */
  flush: () => Promise<boolean>;
  /** Re-reads the clock (called when the app returns to the foreground). */
  refreshClock: () => void;
  completeOnboarding: (userName: string, dailyGoal: number, profile: Partial<UserProfile>) => void;
  addAction: (key: ActionKey, options?: ActionOptions) => void;
  addBlessing: (category: BlessingCategory, title?: string) => void;
  backfill: (inputs: Array<{ key: ActionKey; dateKey: string; title?: string }>, days: string[]) => void;
  removeLog: (id: string) => void;
  startSpeech: () => void;
  resetSpeech: () => void;
  undoSpeechReset: () => void;
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
  const saverRef = useRef<SaveController | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ state: 'idle', error: null, failures: 0, lastSavedAt: null });
  const [now, refreshClock] = useNow();
  const city = cityById(state.profile.cityId);
  // "Today" is the date in the selected city's time zone (policy: CALENDAR_POLICY.dayBoundary).
  const todayKey = cityDateKey(now, city.tzid);
  const minuteKey = Math.floor(now.getTime() / 60_000);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storage = await openStorage();
        const raw = await storage.load();
        if (cancelled) return;
        storageRef.current = storage;
        const loaded = loadState(raw);
        const saver = new SaveController(storage, setSaveStatus);
        saver.markLoaded(loaded);
        saverRef.current = saver;
        dispatch({ type: 'hydrate', payload: loaded });
      } catch (error) {
        console.warn('Could not load app data', error);
        if (!cancelled) setStorageError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
      saverRef.current?.dispose();
    };
  }, []);

  const flush = useCallback(async () => (saverRef.current ? saverRef.current.flush() : true), []);
  const retrySave = useCallback(async () => (saverRef.current ? saverRef.current.retry() : true), []);
  const isLogSaved = useCallback((id: string) => saverRef.current?.isSaved(id) ?? false, []);

  // Every change is handed to the save controller; a failed load leaves it unset, so stored data is
  // never overwritten.
  useEffect(() => {
    if (!hydrated) return;
    saverRef.current?.request(state);
  }, [hydrated, state]);

  const derived = useMemo(() => computeDerived(state, todayKey), [state, todayKey]);

  const dayAndZmanim = useMemo(
    () => ({ day: getDayInfo(todayKey, city.il), zmanim: getZmanim(todayKey, city) }),
    [todayKey, city],
  );
  const restInfo = useMemo(() => {
    const at = new Date(minuteKey * 60_000);
    return {
      rest: getRestWindow(at, city),
      recent: recentRestDays(at, city),
    };
  }, [minuteKey, city]);

  const calendar = useMemo<CalendarState>(
    () => ({
      now,
      city,
      day: dayAndZmanim.day,
      zmanim: dayAndZmanim.zmanim,
      rest: restInfo.rest,
      // Offer after-the-fact logging only for rest days on which nothing was recorded live.
      pendingBackfill: restInfo.recent.filter(
        (k) => !state.backfilledRestDays.includes(k) && !state.logs.some((l) => l.dateKey === k),
      ),
      plan: buildTodayPlan(dayAndZmanim.day, dayAndZmanim.zmanim, state.profile.gender, derived.todayLogs),
    }),
    [now, city, dayAndZmanim, restInfo, state.backfilledRestDays, state.logs, state.profile.gender, derived.todayLogs],
  );

  const value = useMemo<StoreValue>(() => {
    const addAction = (key: ActionKey, options: ActionOptions = {}) => {
      const at = Date.now();
      const onTime =
        options.onTime ??
        (key === 'shacharit' && calendar.zmanim.sofZmanTfilla ? at <= calendar.zmanim.sofZmanTfilla.getTime() : undefined);
      dispatch({
        type: 'addAction',
        payload: { ...options, key, onTime, now: at, dateKey: options.dateKey ?? cityDateKey(new Date(at), city.tzid), context: calendarContextOf(city) },
      });
    };
    return {
      state,
      derived,
      calendar,
      hydrated,
      storageError,
      storageKind: storageRef.current?.kind ?? null,
      saveStatus,
      isLogSaved,
      retrySave,
      flush,
      refreshClock,
      completeOnboarding: (userName, dailyGoal, profile) =>
        dispatch({ type: 'completeOnboarding', payload: { userName, dailyGoal, profile } }),
      addAction,
      addBlessing: (category, title) => addAction('blessing', { category, title }),
      backfill: (inputs, days) =>
        dispatch({
          type: 'addActions',
          payload: inputs.map((i) => ({ ...i, backfill: true, now: Date.now(), context: calendarContextOf(city) })),
          markBackfilled: days,
        }),
      removeLog: (id) => dispatch({ type: 'removeLog', payload: { id } }),
      startSpeech: () => dispatch({ type: 'startSpeech' }),
      resetSpeech: () => dispatch({ type: 'resetSpeech' }),
      undoSpeechReset: () => dispatch({ type: 'undoSpeechReset' }),
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
  }, [calendar, city, derived, hydrated, state, todayKey, storageError, saveStatus, isLogSaved, retrySave, flush, refreshClock]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}
