import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, PropsWithChildren, useContext, useEffect, useMemo, useReducer, useState } from 'react';
import { AppState, BlessingCategory, IconName } from '../types';
import { blessingCategoryMeta } from '../data';

const STORAGE_KEY = 'mitzvot_plus_state_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentTime(): string {
  return new Intl.DateTimeFormat('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function id(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createInitialState(): AppState {
  const now = Date.now();
  return {
    version: 1,
    todayKey: localDateKey(),
    userName: 'יאיר',
    points: 7230,
    dailyGoal: 12,
    dailyLogs: [
      { id: 'demo-1', title: 'תפילת שחרית', time: '07:15', icon: 'prayer', points: 20, createdAt: now - 8 * 60 * 60 * 1000 },
      { id: 'demo-2', title: 'ברכת המזון', time: '08:30', icon: 'food', points: 5, createdAt: now - 7 * 60 * 60 * 1000 },
      { id: 'demo-3', title: 'נתינת צדקה', time: '13:10', icon: 'charity', points: 15, createdAt: now - 3 * 60 * 60 * 1000 },
      { id: 'demo-4', title: 'לימוד תורה', time: '18:45', icon: 'book', points: 20, createdAt: now - 50 * 60 * 1000 },
      { id: 'demo-5', title: 'כיבוד הורים', time: '19:05', icon: 'user', points: 15, createdAt: now - 35 * 60 * 1000 },
      { id: 'demo-6', title: 'ברכה אחרונה', time: '19:20', icon: 'cup', points: 5, createdAt: now - 25 * 60 * 1000 },
      { id: 'demo-7', title: 'מעשה חסד', time: '19:30', icon: 'heart', points: 15, createdAt: now - 15 * 60 * 1000 },
      { id: 'demo-8', title: 'תפילת ערבית', time: '19:40', icon: 'prayer', points: 20, createdAt: now - 5 * 60 * 1000 },
    ],
    weeklyGoal: 80,
    weeklyProgress: 54,
    blessingGoal: 100,
    blessingCounts: {
      enjoyment: 42,
      prayer: 14,
      mitzvah: 8,
      other: 4,
    },
    blessingLogs: [
      { id: 'bl-1', title: 'ברכות השחר', time: '06:15', category: 'prayer', createdAt: now - 9 * 60 * 60 * 1000 },
      { id: 'bl-2', title: 'ברכת המזון', time: '12:30', category: 'enjoyment', createdAt: now - 4 * 60 * 60 * 1000 },
      { id: 'bl-3', title: 'אשר יצר', time: '13:10', category: 'other', createdAt: now - 3 * 60 * 60 * 1000 },
      { id: 'bl-4', title: 'ברכה על שתייה', time: '15:45', category: 'enjoyment', createdAt: now - 80 * 60 * 1000 },
      { id: 'bl-5', title: 'ברכה אחרונה', time: '19:20', category: 'enjoyment', createdAt: now - 25 * 60 * 1000 },
    ],
    lashonHaraSince: now - (5 * DAY_MS + 14 * 60 * 60 * 1000 + 28 * 60 * 1000),
    lashonHaraBestMs: 12 * DAY_MS,
    lashonHaraResets: 2,
    torahSaved: false,
    torahCompletedToday: false,
    torahStreak: 14,
    reflection: '',
  };
}

function resetDailyData(state: AppState): AppState {
  return {
    ...state,
    todayKey: localDateKey(),
    dailyLogs: [],
    blessingCounts: { enjoyment: 0, prayer: 0, mitzvah: 0, other: 0 },
    blessingLogs: [],
    torahCompletedToday: false,
    reflection: '',
  };
}

function normalizeStoredState(value: Partial<AppState>): AppState {
  const initial = createInitialState();
  const merged: AppState = {
    ...initial,
    ...value,
    blessingCounts: {
      ...initial.blessingCounts,
      ...(value.blessingCounts ?? {}),
    },
    dailyLogs: Array.isArray(value.dailyLogs) ? value.dailyLogs : initial.dailyLogs,
    blessingLogs: Array.isArray(value.blessingLogs) ? value.blessingLogs : initial.blessingLogs,
  };

  return merged.todayKey === localDateKey() ? merged : resetDailyData(merged);
}

type Action =
  | { type: 'hydrate'; payload: AppState }
  | { type: 'addMitzvah'; payload: { title: string; icon: IconName; points: number } }
  | { type: 'addBlessing'; payload: { category: BlessingCategory; title?: string } }
  | { type: 'resetSpeech' }
  | { type: 'toggleTorahSaved' }
  | { type: 'completeTorah' }
  | { type: 'setReflection'; payload: string }
  | { type: 'resetDemo' };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.payload;

    case 'addMitzvah': {
      const log = {
        id: id('mitzvah'),
        title: action.payload.title,
        time: currentTime(),
        icon: action.payload.icon,
        points: action.payload.points,
        createdAt: Date.now(),
      };
      return {
        ...state,
        points: state.points + action.payload.points,
        weeklyProgress: Math.min(state.weeklyGoal, state.weeklyProgress + 1),
        dailyLogs: [log, ...state.dailyLogs],
      };
    }

    case 'addBlessing': {
      const total = Object.values(state.blessingCounts).reduce((sum, count) => sum + count, 0);
      if (total >= state.blessingGoal) return state;

      const meta = blessingCategoryMeta[action.payload.category];
      const log = {
        id: id('blessing'),
        title: action.payload.title ?? meta.sample,
        time: currentTime(),
        category: action.payload.category,
        createdAt: Date.now(),
      };
      const dailyLog = {
        id: id('mitzvah'),
        title: log.title,
        time: log.time,
        icon: meta.icon,
        points: 5,
        createdAt: log.createdAt,
      };
      return {
        ...state,
        points: state.points + 5,
        weeklyProgress: Math.min(state.weeklyGoal, state.weeklyProgress + 1),
        blessingCounts: {
          ...state.blessingCounts,
          [action.payload.category]: state.blessingCounts[action.payload.category] + 1,
        },
        blessingLogs: [log, ...state.blessingLogs],
        dailyLogs: [dailyLog, ...state.dailyLogs],
      };
    }

    case 'resetSpeech': {
      const elapsed = Math.max(0, Date.now() - state.lashonHaraSince);
      return {
        ...state,
        lashonHaraSince: Date.now(),
        lashonHaraBestMs: Math.max(state.lashonHaraBestMs, elapsed),
        lashonHaraResets: state.lashonHaraResets + 1,
      };
    }

    case 'toggleTorahSaved':
      return { ...state, torahSaved: !state.torahSaved };

    case 'completeTorah': {
      if (state.torahCompletedToday) return state;
      const log = {
        id: id('mitzvah'),
        title: 'דבר תורה יומי',
        time: currentTime(),
        icon: 'book' as const,
        points: 20,
        createdAt: Date.now(),
      };
      return {
        ...state,
        torahCompletedToday: true,
        torahStreak: state.torahStreak + 1,
        points: state.points + 20,
        weeklyProgress: Math.min(state.weeklyGoal, state.weeklyProgress + 1),
        dailyLogs: [log, ...state.dailyLogs],
      };
    }

    case 'setReflection':
      return { ...state, reflection: action.payload };

    case 'resetDemo':
      return createInitialState();

    default:
      return state;
  }
}

type StoreValue = {
  state: AppState;
  hydrated: boolean;
  blessingTotal: number;
  addMitzvah: (title: string, icon: IconName, points: number) => void;
  addBlessing: (category: BlessingCategory, title?: string) => void;
  resetSpeech: () => void;
  toggleTorahSaved: () => void;
  completeTorah: () => void;
  setReflection: (value: string) => void;
  resetDemo: () => void;
};

const AppStoreContext = createContext<StoreValue | null>(null);

export function AppStoreProvider({ children }: PropsWithChildren): React.ReactElement {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<AppState>;
        dispatch({ type: 'hydrate', payload: normalizeStoredState(parsed) });
      })
      .catch((error) => console.warn('Could not load app data', error))
      .finally(() => {
        if (active) setHydrated(true);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((error) =>
      console.warn('Could not save app data', error),
    );
  }, [hydrated, state]);

  const value = useMemo<StoreValue>(() => {
    const blessingTotal = Object.values(state.blessingCounts).reduce((sum, count) => sum + count, 0);
    return {
      state,
      hydrated,
      blessingTotal,
      addMitzvah: (title, icon, points) => dispatch({ type: 'addMitzvah', payload: { title, icon, points } }),
      addBlessing: (category, title) => dispatch({ type: 'addBlessing', payload: { category, title } }),
      resetSpeech: () => dispatch({ type: 'resetSpeech' }),
      toggleTorahSaved: () => dispatch({ type: 'toggleTorahSaved' }),
      completeTorah: () => dispatch({ type: 'completeTorah' }),
      setReflection: (reflection) => dispatch({ type: 'setReflection', payload: reflection }),
      resetDemo: () => dispatch({ type: 'resetDemo' }),
    };
  }, [hydrated, state]);

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore(): StoreValue {
  const value = useContext(AppStoreContext);
  if (!value) throw new Error('useAppStore must be used inside AppStoreProvider');
  return value;
}
