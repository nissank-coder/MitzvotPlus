import { blessingCategoryMeta, quickMitzvot } from '../data';
import { DAY_MS, localDateKey } from '../lib/dates';
import { ActionKey, ActivityLog, AppSettings, AppState, BlessingCategory, IconName, LogKind } from '../types';

export const STORAGE_KEY = 'mitzvot_plus_state_v1';
export const BLESSING_POINTS = 5;
export const DAILY_TORAH_POINTS = 20;

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const defaultSettings: AppSettings = { notifications: true, privateProfile: true };

/** A brand-new user: no history, onboarding not finished. */
export function createFreshState(now = Date.now()): AppState {
  return {
    version: 2,
    onboarded: false,
    userName: '',
    memberSince: now,
    legacyPoints: 0,
    dailyGoal: 12,
    weeklyGoal: 60,
    blessingGoal: 100,
    logs: [],
    lashonHaraSince: now,
    lashonHaraBestMs: 0,
    lashonHaraResets: 0,
    torahSaved: false,
    reflections: {},
    settings: { ...defaultSettings },
    joinedGroups: {},
  };
}

function makeLog(
  input: { title: string; icon: IconName; points: number; kind: LogKind; actionKey?: ActionKey; category?: BlessingCategory },
  createdAt: number,
  idPrefix = input.kind,
): ActivityLog {
  return { id: makeId(idPrefix), createdAt, dateKey: localDateKey(createdAt), ...input };
}

/** Deterministic pseudo-random generator so the demo looks the same every time. */
function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

/** Demo user with ~3 weeks of realistic history. */
export function createDemoState(now = Date.now()): AppState {
  const rand = seeded(42);
  const logs: ActivityLog[] = [];
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const blessingCategories: BlessingCategory[] = ['enjoyment', 'enjoyment', 'prayer', 'mitzvah', 'other'];

  for (let daysAgo = 21; daysAgo >= 0; daysAgo -= 1) {
    const dayStart = startOfToday.getTime() - daysAgo * DAY_MS;
    if (new Date(dayStart).getDay() === 6) continue; // no app use on Shabbat
    const isToday = daysAgo === 0;
    const limit = isToday ? Math.min(now, dayStart + DAY_MS - 1) : dayStart + 22 * 60 * 60 * 1000;
    const at = (hour: number) => Math.min(limit, dayStart + hour * 60 * 60 * 1000 + Math.floor(rand() * 40) * 60 * 1000);

    const actions = quickMitzvot.filter((m) => m.key !== 'blessing');
    const count = isToday ? 5 : 3 + Math.floor(rand() * 5);
    for (let i = 0; i < count; i += 1) {
      const item = actions[Math.floor(rand() * actions.length)];
      const createdAt = at(7 + i * 2);
      if (!item || createdAt > now) continue;
      logs.push(makeLog({ title: item.title, icon: item.icon, points: item.points, kind: 'mitzvah', actionKey: item.key }, createdAt));
    }
    const blessings = isToday ? 6 : 4 + Math.floor(rand() * 8);
    for (let i = 0; i < blessings; i += 1) {
      const category = blessingCategories[Math.floor(rand() * blessingCategories.length)] ?? 'other';
      const meta = blessingCategoryMeta[category];
      const createdAt = at(6 + i);
      if (createdAt > now) continue;
      logs.push(
        makeLog({ title: meta.sample, icon: meta.icon, points: BLESSING_POINTS, kind: 'blessing', actionKey: 'blessing', category }, createdAt),
      );
    }
    if (!isToday && rand() > 0.15) {
      logs.push(
        makeLog(
          { title: 'דבר תורה יומי', icon: 'book', points: DAILY_TORAH_POINTS, kind: 'torah', actionKey: 'dailyTorah' },
          at(20),
        ),
      );
    }
  }

  return {
    ...createFreshState(now),
    onboarded: true,
    userName: 'יאיר',
    memberSince: now - 120 * DAY_MS,
    logs: logs.sort((a, b) => b.createdAt - a.createdAt),
    lashonHaraSince: now - (5 * DAY_MS + 14 * 60 * 60 * 1000),
    lashonHaraBestMs: 12 * DAY_MS,
    lashonHaraResets: 2,
  };
}

/* ------------------------- Loading & migration ------------------------- */

type V1Log = { id: string; title: string; icon: IconName; points: number; createdAt: number };
type V1State = {
  version?: 1;
  todayKey?: string;
  userName?: string;
  points?: number;
  dailyGoal?: number;
  weeklyGoal?: number;
  blessingGoal?: number;
  dailyLogs?: V1Log[];
  blessingLogs?: Array<{ createdAt: number; category: BlessingCategory }>;
  lashonHaraSince?: number;
  lashonHaraBestMs?: number;
  lashonHaraResets?: number;
  torahSaved?: boolean;
  reflection?: string;
};

function actionKeyForTitle(title: string): ActionKey | undefined {
  return quickMitzvot.find((m) => m.title === title)?.key;
}

/** v1 kept only today's logs plus a running points counter; carry both over. */
export function migrateV1(old: V1State, now = Date.now()): AppState {
  const fresh = createFreshState(now);
  const dailyLogs = Array.isArray(old.dailyLogs) ? old.dailyLogs : [];
  const blessingByTime = new Map((old.blessingLogs ?? []).map((b) => [b.createdAt, b.category]));
  const logs: ActivityLog[] = dailyLogs.map((log) => {
    const category = blessingByTime.get(log.createdAt);
    const kind: LogKind = category ? 'blessing' : log.title === 'דבר תורה יומי' ? 'torah' : 'mitzvah';
    return {
      id: log.id,
      title: log.title,
      icon: log.icon,
      points: log.points,
      createdAt: log.createdAt,
      dateKey: localDateKey(log.createdAt),
      kind,
      category,
      actionKey: kind === 'blessing' ? 'blessing' : kind === 'torah' ? 'dailyTorah' : actionKeyForTitle(log.title),
    };
  });
  const loggedPoints = logs.reduce((sum, l) => sum + l.points, 0);
  return {
    ...fresh,
    onboarded: true,
    userName: old.userName || 'משתמש',
    legacyPoints: Math.max(0, (old.points ?? 0) - loggedPoints),
    dailyGoal: old.dailyGoal ?? fresh.dailyGoal,
    weeklyGoal: old.weeklyGoal ?? fresh.weeklyGoal,
    blessingGoal: old.blessingGoal ?? fresh.blessingGoal,
    logs,
    lashonHaraSince: old.lashonHaraSince ?? now,
    lashonHaraBestMs: old.lashonHaraBestMs ?? 0,
    lashonHaraResets: old.lashonHaraResets ?? 0,
    torahSaved: Boolean(old.torahSaved),
    reflections: old.reflection && old.todayKey ? { [old.todayKey]: old.reflection } : {},
  };
}

export function loadState(raw: string | null, now = Date.now()): AppState {
  if (!raw) return createFreshState(now);
  const parsed = JSON.parse(raw) as Partial<AppState> | V1State;
  if (!parsed || typeof parsed !== 'object') return createFreshState(now);
  if (parsed.version !== 2) return migrateV1(parsed as V1State, now);
  const fresh = createFreshState(now);
  const value = parsed as Partial<AppState>;
  return {
    ...fresh,
    ...value,
    version: 2,
    logs: Array.isArray(value.logs) ? value.logs : [],
    reflections: value.reflections ?? {},
    settings: { ...fresh.settings, ...(value.settings ?? {}) },
    joinedGroups: value.joinedGroups ?? {},
  };
}

/* ------------------------------- Reducer ------------------------------- */

export type Action =
  | { type: 'hydrate'; payload: AppState }
  | { type: 'completeOnboarding'; payload: { userName: string; dailyGoal: number } }
  | { type: 'addMitzvah'; payload: { title: string; icon: IconName; points: number; actionKey?: ActionKey }; now?: number }
  | { type: 'addBlessing'; payload: { category: BlessingCategory; title?: string }; now?: number }
  | { type: 'removeLog'; payload: { id: string } }
  | { type: 'resetSpeech'; now?: number }
  | { type: 'toggleTorahSaved' }
  | { type: 'completeTorah'; now?: number }
  | { type: 'setReflection'; payload: { dateKey: string; text: string } }
  | { type: 'updateGoals'; payload: Partial<Pick<AppState, 'dailyGoal' | 'weeklyGoal' | 'blessingGoal' | 'userName'>> }
  | { type: 'updateSettings'; payload: Partial<AppSettings> }
  | { type: 'toggleGroup'; payload: { key: string } }
  | { type: 'loadDemo' }
  | { type: 'resetAll' };

function prepend(state: AppState, log: ActivityLog): AppState {
  return { ...state, logs: [log, ...state.logs] };
}

const clampGoal = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)));

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.payload;

    case 'completeOnboarding':
      return {
        ...state,
        onboarded: true,
        userName: action.payload.userName.trim() || 'משתמש',
        dailyGoal: clampGoal(action.payload.dailyGoal, 1, 50),
        weeklyGoal: clampGoal(action.payload.dailyGoal * 5, 5, 300),
        memberSince: Date.now(),
      };

    case 'addMitzvah':
      return prepend(state, makeLog({ ...action.payload, kind: 'mitzvah' }, action.now ?? Date.now()));

    case 'addBlessing': {
      // There is no upper limit: one may (and should) bless more than 100 times a day.
      const meta = blessingCategoryMeta[action.payload.category];
      return prepend(
        state,
        makeLog(
          {
            title: action.payload.title ?? meta.sample,
            icon: meta.icon,
            points: BLESSING_POINTS,
            kind: 'blessing',
            actionKey: 'blessing',
            category: action.payload.category,
          },
          action.now ?? Date.now(),
        ),
      );
    }

    case 'removeLog':
      return { ...state, logs: state.logs.filter((log) => log.id !== action.payload.id) };

    case 'resetSpeech': {
      const now = action.now ?? Date.now();
      const elapsed = Math.max(0, now - state.lashonHaraSince);
      return {
        ...state,
        lashonHaraSince: now,
        lashonHaraBestMs: Math.max(state.lashonHaraBestMs, elapsed),
        lashonHaraResets: state.lashonHaraResets + 1,
      };
    }

    case 'toggleTorahSaved':
      return { ...state, torahSaved: !state.torahSaved };

    case 'completeTorah': {
      const now = action.now ?? Date.now();
      const today = localDateKey(now);
      if (state.logs.some((log) => log.kind === 'torah' && log.dateKey === today)) return state;
      return prepend(
        state,
        makeLog({ title: 'דבר תורה יומי', icon: 'book', points: DAILY_TORAH_POINTS, kind: 'torah', actionKey: 'dailyTorah' }, now),
      );
    }

    case 'setReflection':
      return { ...state, reflections: { ...state.reflections, [action.payload.dateKey]: action.payload.text } };

    case 'updateGoals': {
      const p = action.payload;
      return {
        ...state,
        userName: p.userName !== undefined ? p.userName.trim() || state.userName : state.userName,
        dailyGoal: p.dailyGoal !== undefined ? clampGoal(p.dailyGoal, 1, 50) : state.dailyGoal,
        weeklyGoal: p.weeklyGoal !== undefined ? clampGoal(p.weeklyGoal, 5, 300) : state.weeklyGoal,
        blessingGoal: p.blessingGoal !== undefined ? clampGoal(p.blessingGoal, 10, 300) : state.blessingGoal,
      };
    }

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case 'toggleGroup':
      return {
        ...state,
        joinedGroups: { ...state.joinedGroups, [action.payload.key]: !state.joinedGroups[action.payload.key] },
      };

    case 'loadDemo':
      return createDemoState();

    case 'resetAll':
      return createFreshState();

    default:
      return state;
  }
}
