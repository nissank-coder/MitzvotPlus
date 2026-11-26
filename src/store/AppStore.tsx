import React, { createContext, PropsWithChildren, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { localStorageSpaces, StateStorage } from '../storage/persistence';
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
import { syncNow, SyncRemote, SyncStatus } from '../sync/engine';
import { goalWireOf, withBlessingGoals } from '../sync/goals';
import { createSyncCoordinator } from '../sync/coordinator';
import type { SpaceManager, SqlStateStorage } from '../storage/sqliteStorage';
import { restRuleFor } from '../lib/restRule';
import { buildTodayPlan, PlanItem } from '../lib/todayPlan';
import { AppSettings, AppState, BlessingCategory, HabitSelection, UserProfile } from '../types';
import { SCORING_RULES_VERSION } from '../lib/metrics';
import { computeDerived, Derived } from './derived';
import { addedSince, feedbackFor, FeedbackSnapshot, snapshotOf } from './feedback';
import { createFreshState, loadState, reducer } from './state';

export type ActionOptions = Omit<ActionInput, 'key' | 'now'>;

/** Feedback after a SAVED change: an entry, a habit, the daily goal, an achievement, a challenge. */
export type Celebration = {
  id: number;
  kind: 'saved' | 'habit' | 'goal' | 'award' | 'challenge';
  title: string;
  detail?: string;
  /** Exactly the entries this feedback is about (saved / habit / goal): "ביטול" removes these. */
  logIds?: string[];
  logTitle?: string;
};

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
  /**
   * Runs one two-way sync with the given server (round 12). Only on the phone's SQLite storage (the
   * browser storage has no outbox); the caller passes the user's current consent.
   */
  runSync: (remote: SyncRemote, consent: boolean) => Promise<SyncStatus>;
  /** Stops a running sync: its later responses are dropped (sign-out, account switch, consent off). */
  cancelSync: () => void;
  /** The data space on screen: 'guest' or 'user:<account id>' (round 12.5). */
  space: string;
  /** Number of entries stored in a data space on this device. */
  spaceCount: (space: string) => Promise<number>;
  /**
   * Switches the data on screen to another space. Pending changes are saved first (if that fails,
   * nothing switches). `transferFrom` moves that space's entries into the new one – only after the
   * user confirmed it; `deleteSpace` removes a space from this device (also confirmed).
   */
  switchSpace: (space: string, options?: { transferFrom?: string; deleteSpace?: string }) => Promise<void>;
  /** After the cloud copy was deleted: queue every entry again (user agreed), or keep it local. */
  markCloudDeleted: () => void;
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

/** SQLite on iOS/Android, browser storage on the web – one data space per account. */
async function openSpaces(): Promise<SpaceManager> {
  if (Capacitor.isNativePlatform()) {
    const { openNativeSpaces } = await import('../storage/sqliteStorage');
    return openNativeSpaces();
  }
  return localStorageSpaces() as unknown as SpaceManager;
}

export function AppStoreProvider({ children }: PropsWithChildren): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, () => createFreshState());
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const storageRef = useRef<StateStorage | null>(null);
  const spacesRef = useRef<SpaceManager | null>(null);
  const [space, setSpace] = useState('guest');
  const spaceRef = useRef('guest');
  // Every sign-out / account switch / consent change starts a new generation: a sync of an older
  // generation can still finish its requests, but nothing it receives is applied any more.
  const coordinator = useRef(createSyncCoordinator()).current;
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
        const spaces = await openSpaces();
        const active = await spaces.active();
        const storage = await spaces.open(active);
        const raw = await storage.load();
        if (cancelled) return;
        spacesRef.current = spaces;
        spaceRef.current = active;
        setSpace(active);
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
  const requestedCursor = useRef(0);
  const requestedEpoch = useRef(1);
  useEffect(() => {
    if (!hydrated) return;
    saverRef.current?.request(state);
    requestedCursor.current = state.sync?.cursor ?? 0;
    requestedEpoch.current = state.sync?.backupEpoch ?? 1;
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
  // Round 1.1: the feedback is about exactly the entries that were added (see store/feedback.ts).
  const seen = useRef<FeedbackSnapshot | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    const prev = seen.current;
    const current = snapshotOf(state, derived);
    if (!prev || prev.day !== current.day) {
      seen.current = current;
      return;
    }
    const added = addedSince(prev, state.logs);
    if (added.length === 0) {
      seen.current = current;
      return;
    }
    // Wait until every new entry is durably saved before any feedback.
    if (!added.every((l) => isLogSaved(l.id))) return;
    seen.current = current;
    const next = feedbackFor(prev, added, state, derived);
    if (next) setCelebration({ id: Date.now(), ...next });
  }, [hydrated, state, derived, isLogSaved, saveStatus]);

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
    const extra = first ? `הישג חדש: ${first.def.title}` : `אתגר הושלם: ${done[0]!.def.title}`;
    // An achievement earned by the entry just recorded joins that entry's feedback (which may carry
    // the goal message and "ביטול") instead of replacing it.
    setCelebration((prev) =>
      prev && at - prev.id < 2000
        ? { ...prev, detail: prev.detail ? `${prev.detail} · ${extra}` : extra }
        : first
          ? { id: at, kind: 'award', title: extra, detail: first.def.explanation }
          : { id: at, kind: 'challenge', title: extra, detail: 'נשמר בהיסטוריית המסלולים' },
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
      runSync: (remote, consent) => {
        const storage = storageRef.current as (SqlStateStorage & { kind: 'sqlite' }) | null;
        return coordinator.run(spaceRef.current, () => spaceRef.current, async (sameSession) => {
          const isCurrent = () => sameSession() && storageRef.current === storage;
          if (!storage || storage.kind !== 'sqlite' || !('listOutbox' in storage)) return { state: 'error', code: 'unknown', at: Date.now(), pending: 0 };
          const logs = state.logs;
          let cursor = state.sync?.cursor ?? 0;
          let goalsKnown = { fingerprint: state.sync?.goalsHash ?? null, version: state.sync?.goalsVersion ?? 0 };
          let goalHistory = state.goalHistory;
          let backupLocal = { epoch: state.sync?.backupEpoch ?? 1, floor: state.sync?.backupFloor ?? null };
          return syncNow({
            listOutbox: () => storage.listOutbox(),
            saveOutbox: (i) => storage.saveOutbox(i),
            installationId: () => storage.installationId(),
            logs: () => logs,
            cursor: () => cursor,
            applyRemote: (events) => {
              if (!isCurrent()) return;
              dispatch({ type: 'applyRemoteEvents', payload: events });
              cursor = Math.max(cursor, ...events.map((e) => e.seq));
            },
            persist: async () => {
              // Wait until the state holding the applied events reached the save controller, then
              // write it: entries and cursor in one transaction, before "synced" is shown.
              // A new backup generation is written with them (round 13, B1).
              const ready = () => requestedCursor.current >= cursor && requestedEpoch.current === backupLocal.epoch;
              for (let i = 0; i < 200 && !ready(); i += 1) await new Promise((r) => setTimeout(r, 10));
              return isCurrent() && ready() && (await flush());
            },
            isCurrent,
            goals: {
              wire: () => goalWireOf(goalHistory),
              known: () => goalsKnown,
              adopt: (wire) => {
                if (!isCurrent()) return;
                goalHistory = withBlessingGoals(goalHistory, wire);
                dispatch({ type: 'goalsAdopted', payload: { wire } });
              },
              markSynced: (fingerprint, version) => {
                goalsKnown = { fingerprint, version };
                if (isCurrent()) dispatch({ type: 'goalsSynced', payload: { fingerprint, version } });
              },
            },
            backup: {
              local: () => backupLocal,
              // A new backup generation: the queue is rebuilt on the device first (one transaction),
              // then the state records it; until that state is saved, the next start rebuilds again.
              rebuild: async (next) => {
                if (!isCurrent()) return;
                await storage.rebuildOutbox(next.floor);
                backupLocal = next;
                cursor = 0;
                goalsKnown = { fingerprint: null, version: 0 };
                dispatch({ type: 'backupGenerationApplied', payload: next });
              },
            },
            remote,
            gate: { enabled: true, consent: { cloudBackup: consent } },
            now: Date.now,
          });
        });
      },
      cancelSync: () => coordinator.cancel(),
      space,
      spaceCount: async (target) => (spacesRef.current ? spacesRef.current.count(target) : 0),
      switchSpace: async (target, options = {}) => {
        const spaces = spacesRef.current;
        if (!spaces) throw new Error('storage_unavailable');
        coordinator.cancel();
        // Nothing of the current space may be lost: save first, or do not switch at all.
        if (saverRef.current && !(await saverRef.current.flush())) throw new Error('local_save_failed');
        setHydrated(false);
        try {
          saverRef.current?.dispose();
          saverRef.current = null;
          if (options.transferFrom) await spaces.transfer(options.transferFrom, target);
          if (options.deleteSpace && options.deleteSpace !== target) await spaces.deleteSpace(options.deleteSpace);
          await spaces.setActive(target);
          const storage = await spaces.open(target);
          const loaded = loadState(await storage.load());
          storageRef.current = storage;
          spaceRef.current = target;
          const saver = new SaveController(storage, setSaveStatus);
          saver.markLoaded(loaded);
          saverRef.current = saver;
          seen.current = null;
          primed.current = false;
          dispatch({ type: 'hydrate', payload: loaded });
          setSpace(target);
        } catch (error) {
          // The data of the space stays where it was; the app refuses to write over anything.
          setStorageError(error instanceof Error ? error.message : String(error));
          throw error;
        } finally {
          setHydrated(true);
        }
      },
      markCloudDeleted: () => dispatch({ type: 'cloudDataDeleted', payload: { at: Date.now() } }),
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
  }, [calendar, city, derived, isRestDay, hydrated, state, todayKey, storageError, saveStatus, isLogSaved, retrySave, flush, refreshClock, celebration, space]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}
