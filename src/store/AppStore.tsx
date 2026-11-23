import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useReducer, useState } from 'react';
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
import { createFreshState, loadState, reducer, STORAGE_KEY } from './state';

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
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function AppStoreProvider({ children }: PropsWithChildren): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, () => createFreshState());
  const [hydrated, setHydrated] = useState(false);
  const now = useNow();
  const todayKey = localDateKey(now);
  const minuteKey = Math.floor(now.getTime() / 60_000);

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
  }, [calendar, derived, hydrated, state, todayKey]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}
