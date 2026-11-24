import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { localStorageStorage, StateStorage } from '../storage/persistence';
import { SaveController, SaveStatus } from '../storage/saveController';
import { DVAR_TORAH_AVAILABLE } from '../content/registry';
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
import { ActionInput, buildLog } from '../lib/scoring';
import { restRuleFor } from '../lib/restRule';
import { buildTodayPlan, PlanItem } from '../lib/todayPlan';
import { AppSettings, AppState, BlessingCategory, HabitSelection, UserProfile } from '../types';
import { SCORING_RULES_VERSION } from '../lib/metrics';
import { computeDerived, Derived } from './derived';
import { createFreshState, loadState, reducer } from './state';

export type ActionOptions = Omit<ActionInput, 'key' | 'now'>;

/** Feedback after a SAVED change: an entry, a habit, the daily goal, an achievement, a challenge. */
export type Celebration = { id: number; kind: 'saved' | 'habit' | 'goal' | 'award' | 'challenge'; title: string; detail?: string };

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
  /** Shabbat / Yom Tov for the selected city – the one rest-day rule used by every streak. */
  isRestDay: (dateKey: string) => boolean;
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
  completeOnboarding: (userName: string, dailyGoal: number, profile: Partial<UserProfile>, habits?: HabitSelection[]) => void;
  /** Choose / edit habits (applies from today; history keeps the habits it had). */
  setHabits: (habits: HabitSelection[], habitTarget?: number) => void;
  joinChallenge: (definitionId: string) => void;
  leaveChallenge: (instanceId: string) => void;
  /** Last moment something was confirmed saved and celebrated (feedback). */
  celebration: Celebration | null;
  dismissCelebration: () => void;
  addAction: (key: ActionKey, options?: ActionOptions) => void;
  addBlessing: (category: BlessingCategory, title?: string) => void;
  backfill: (inputs: Array<{ key: ActionKey; dateKey: string; title?: string }>, days: string[]) => void;
  removeLog: (id: string) => void;
  startSpeech: () => void;
  resetSpeech: () => void;
  undoSpeechReset: () => void;
  /**
   * Points an action would get if recorded now – from the same engine as the totals, so the
   * number on a button always matches what is recorded (0 if it would be a duplicate or capped).
   */
  previewPoints: (key: ActionKey, options?: ActionOptions) => number;
  /** Saves / unsaves a specific content item (id@version). */
  toggleSavedContent: (ref: string) => void;
  /** Confirms how many blessings were said as part of an entry (replaces any earlier number). */
  setBlessingBundle: (sourceLogId: string, count: number) => void;
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

  // Without an initialised save controller nothing was written: never report success.
  const flush = useCallback(async () => (saverRef.current ? saverRef.current.flush() : false), []);
  const retrySave = useCallback(async () => (saverRef.current ? saverRef.current.retry() : false), []);
  const isLogSaved = useCallback((id: string) => saverRef.current?.isSaved(id) ?? false, []);

  // Every change is handed to the save controller; a failed load leaves it unset, so stored data is
  // never overwritten.
  useEffect(() => {
    if (!hydrated) return;
    saverRef.current?.request(state);
  }, [hydrated, state]);

  // One rest-day rule for every streak: Shabbat and Yom Tov for the selected city (cached per day).
  // Each past day uses the city that was in force on it (locationHistory), not today's city.
  const isRestDay = useMemo(
    () => restRuleFor(state.locationHistory, state.profile.cityId),
    [state.locationHistory, state.profile.cityId],
  );
  const startKey = cityDateKey(new Date(state.memberSince), city.tzid);
  const derived = useMemo(
    () => computeDerived(state, todayKey, isRestDay, startKey),
    [state, todayKey, isRestDay, startKey],
  );

  // Feedback and completion only after the change is stored on the device (B08 / C1):
  // achievements and challenge completions are recorded once the latest entry is saved.
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const seen = useRef<{ logs: number; habits: number; goal: boolean; day: string } | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    const latest = derived.todayLogs[0];
    const prev = seen.current;
    const now = { logs: state.logs.length, habits: derived.habitsDoneToday, goal: derived.todayGoalMet, day: todayKey };
    if (!prev || prev.day !== todayKey) {
      seen.current = now;
      return;
    }
    const added = state.logs.length > prev.logs;
    if (!added) {
      seen.current = { ...now };
      return;
    }
    // Wait until the new entry is durably saved before any feedback.
    if (!latest || !isLogSaved(latest.id)) return;
    seen.current = now;
    let next: Omit<Celebration, 'id'>;
    if (derived.todayGoalMet && !prev.goal) next = { kind: 'goal', title: 'היעד היומי הושלם', detail: 'יישר כוח' };
    else if (derived.habitsDoneToday > prev.habits)
      next = { kind: 'habit', title: 'הרגל הושלם', detail: `${derived.habitsDoneToday}/${derived.habitTarget} הרגלים היום` };
    else next = { kind: 'saved', title: 'נרשם', detail: derived.hasHabits ? `${derived.habitsDoneToday}/${derived.habitTarget} הרגלים` : undefined };
    setCelebration({ id: Date.now(), ...next });
  }, [hydrated, state.logs.length, derived, todayKey, isLogSaved, saveStatus]);

  // The first evaluation after loading records past achievements quietly ("earned before"),
  // without a celebration (no surprising retroactive rewards).
  const primed = useRef(false);
  useEffect(() => {
    if (!hydrated || saveStatus.state === 'saving' || saveStatus.state === 'error') return;
    const quiet = !primed.current;
    primed.current = true;
    const latest = derived.todayLogs[0];
    if (latest && !isLogSaved(latest.id)) return;
    const done = derived.challenges.filter((c) => c.state === 'active' && c.reached);
    const ready = derived.achievements.filter((a) => a.ready);
    if (done.length === 0 && ready.length === 0) return;
    const at = Date.now();
    if (done.length > 0) dispatch({ type: 'completeChallenges', payload: { instanceIds: done.map((c) => c.enrollment.instanceId), now: at } });
    if (ready.length > 0)
      dispatch({
        type: 'grantAwards',
        payload: ready.map((a) => ({ achievementId: a.def.id, version: a.def.version, earnedAt: at, rulesVersion: SCORING_RULES_VERSION })),
      });
    if (quiet) return;
    const first = ready[0];
    setCelebration(
      first
        ? { id: at, kind: 'award', title: `הישג חדש: ${first.def.title}`, detail: first.def.explanation }
        : { id: at, kind: 'challenge', title: `אתגר הושלם: ${done[0]!.def.title}`, detail: 'נשמר בהיסטוריית המסלולים' },
    );
  }, [hydrated, derived, saveStatus, isLogSaved]);

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
      plan: buildTodayPlan(dayAndZmanim.day, dayAndZmanim.zmanim, state.profile.gender, derived.todayLogs, { dvarTorah: DVAR_TORAH_AVAILABLE }),
    }),
    [now, city, dayAndZmanim, restInfo, state.backfilledRestDays, state.logs, state.profile.gender, derived.todayLogs],
  );

  const value = useMemo<StoreValue>(() => {
    const inputFor = (key: ActionKey, options: ActionOptions, at: number): ActionInput => {
      const live = !options.backfill && (options.dateKey === undefined || options.dateKey === todayKey);
      const onTime =
        live && key === 'shacharit' && calendar.zmanim.sofZmanTfilla ? at <= calendar.zmanim.sofZmanTfilla.getTime() : undefined;
      return { ...options, key, onTime, now: at, dateKey: options.dateKey ?? cityDateKey(new Date(at), city.tzid), context: calendarContextOf(city) };
    };
    const previewPoints = (key: ActionKey, options: ActionOptions = {}) =>
      buildLog(state.logs, inputFor(key, options, Date.now()))?.points ?? 0;
    const addAction = (key: ActionKey, options: ActionOptions = {}) =>
      dispatch({ type: 'addAction', payload: inputFor(key, options, Date.now()) });
    return {
      state,
      derived,
      calendar,
      isRestDay,
      hydrated,
      storageError,
      storageKind: storageRef.current?.kind ?? null,
      saveStatus,
      isLogSaved,
      retrySave,
      flush,
      refreshClock,
      completeOnboarding: (userName, dailyGoal, profile, habits) =>
        dispatch({ type: 'completeOnboarding', payload: { userName, dailyGoal, profile, dateKey: todayKey, habits } }),
      setHabits: (habits, habitTarget) => dispatch({ type: 'setHabits', payload: { habits, habitTarget }, dateKey: todayKey }),
      joinChallenge: (definitionId) => dispatch({ type: 'joinChallenge', payload: { definitionId, now: Date.now() }, dateKey: todayKey }),
      leaveChallenge: (instanceId) => dispatch({ type: 'leaveChallenge', payload: { instanceId, now: Date.now() } }),
      celebration,
      dismissCelebration: () => setCelebration(null),
      addAction,
      previewPoints,
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
      toggleSavedContent: (ref) => dispatch({ type: 'toggleSavedContent', payload: { ref } }),
      setBlessingBundle: (sourceLogId, count) =>
        dispatch({ type: 'setBlessingBundle', payload: { sourceLogId, count, now: Date.now() } }),
      setReflection: (text) => dispatch({ type: 'setReflection', payload: { dateKey: todayKey, text } }),
      updateGoals: (goals) => dispatch({ type: 'updateGoals', payload: goals, dateKey: todayKey }),
      updateSettings: (settings) => dispatch({ type: 'updateSettings', payload: settings }),
      updateProfile: (profile) => dispatch({ type: 'updateProfile', payload: profile, dateKey: todayKey }),
      toggleTrack: (key) => dispatch({ type: 'toggleTrack', payload: { key } }),
      toggleGroup: (key) => dispatch({ type: 'toggleGroup', payload: { key } }),
      loadDemo: () => dispatch({ type: 'loadDemo' }),
      resetAll: () => dispatch({ type: 'resetAll' }),
    };
  }, [calendar, city, derived, isRestDay, hydrated, state, todayKey, storageError, saveStatus, isLogSaved, retrySave, flush, refreshClock, celebration]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}
