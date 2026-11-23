import { blessingCategoryMeta } from '../data';
import { ActionKey } from '../data/actions';
import { DEFAULT_CITY_ID } from '../data/locations';
import { DEFAULT_TRACKS } from '../lib/learning';
import { DAY_MS, localDateKey } from '../lib/dates';
import { ActionInput, buildLog } from '../lib/scoring';
import { ActivityLog, AppSettings, AppState, BlessingCategory, IconName, LogKind, UserProfile } from '../types';

export const STORAGE_KEY = 'mitzvot_plus_state_v1';

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
    profile: { gender: 'male', nusach: 'sefard', cityId: DEFAULT_CITY_ID },
    learningTracks: [...DEFAULT_TRACKS],
    backfilledRestDays: [],
  };
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
  const fresh = createFreshState(now);
  let logs: ActivityLog[] = [];
  const add = (input: Omit<ActionInput, 'now'>, at: number) => {
    if (at > now) return;
    const log = buildLog(logs, { ...input, now: at }, fresh.blessingGoal);
    if (log) logs = [log, ...logs];
  };
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const blessingCategories: BlessingCategory[] = ['enjoyment', 'enjoyment', 'prayer', 'mitzvah', 'other'];
  const extras: ActionKey[] = ['charity', 'chesed', 'parents', 'torahStudy', 'tehillim', 'birkatHamazon'];

  for (let daysAgo = 21; daysAgo >= 0; daysAgo -= 1) {
    const dayStart = startOfToday.getTime() - daysAgo * DAY_MS;
    if (new Date(dayStart).getDay() === 6) continue; // no app use on Shabbat
    const at = (hour: number) => dayStart + hour * 60 * 60 * 1000 + Math.floor(rand() * 40) * 60 * 1000;

    add({ key: 'shacharit', minyan: rand() > 0.3, onTime: rand() > 0.2 }, at(7));
    add({ key: 'tefillin' }, at(7));
    if (rand() > 0.3) add({ key: 'mincha', minyan: rand() > 0.5 }, at(13));
    if (rand() > 0.2) add({ key: 'arvit', minyan: rand() > 0.5 }, at(19));
    const count = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < count; i += 1) {
      const key = extras[Math.floor(rand() * extras.length)] ?? 'chesed';
      add({ key }, at(9 + i * 2));
    }
    const blessings = 8 + Math.floor(rand() * 15);
    for (let i = 0; i < blessings; i += 1) {
      const category = blessingCategories[Math.floor(rand() * blessingCategories.length)] ?? 'other';
      add({ key: 'blessing', category, title: blessingCategoryMeta[category].sample }, at(6 + i * 0.6));
    }
    if (rand() > 0.15) add({ key: 'dailyTorah' }, at(20));
  }

  return {
    ...fresh,
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

const V1_TITLES: Record<string, ActionKey> = {
  'תפילה': 'prayer',
  'לימוד תורה': 'torahStudy',
  'נתינת צדקה': 'charity',
  'מעשה חסד': 'chesed',
  'כיבוד הורים': 'parents',
};
function actionKeyForTitle(title: string): ActionKey | undefined {
  return V1_TITLES[title];
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
    profile: { ...fresh.profile, ...(value.profile ?? {}) },
    learningTracks: Array.isArray(value.learningTracks) ? value.learningTracks : fresh.learningTracks,
    backfilledRestDays: Array.isArray(value.backfilledRestDays) ? value.backfilledRestDays : [],
  };
}

/* ------------------------------- Reducer ------------------------------- */

export type Action =
  | { type: 'hydrate'; payload: AppState }
  | { type: 'completeOnboarding'; payload: { userName: string; dailyGoal: number; profile: Partial<UserProfile> } }
  | { type: 'addAction'; payload: ActionInput }
  | { type: 'addActions'; payload: ActionInput[]; markBackfilled?: string[] }
  | { type: 'removeLog'; payload: { id: string } }
  | { type: 'resetSpeech'; now?: number }
  | { type: 'toggleTorahSaved' }
  | { type: 'setReflection'; payload: { dateKey: string; text: string } }
  | { type: 'updateGoals'; payload: Partial<Pick<AppState, 'dailyGoal' | 'weeklyGoal' | 'blessingGoal' | 'userName'>> }
  | { type: 'updateSettings'; payload: Partial<AppSettings> }
  | { type: 'updateProfile'; payload: Partial<UserProfile> }
  | { type: 'toggleTrack'; payload: { key: string } }
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
        profile: { ...state.profile, ...action.payload.profile },
      };

    case 'addAction': {
      const log = buildLog(state.logs, action.payload, state.blessingGoal);
      return log ? prepend(state, log) : state;
    }

    case 'addActions': {
      let logs = state.logs;
      for (const input of action.payload) {
        const log = buildLog(logs, input, state.blessingGoal);
        if (log) logs = [log, ...logs];
      }
      const marked = action.markBackfilled ?? [];
      return {
        ...state,
        logs,
        backfilledRestDays: [...new Set([...state.backfilledRestDays, ...marked])].slice(-30),
      };
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

    case 'updateProfile':
      return { ...state, profile: { ...state.profile, ...action.payload } };

    case 'toggleTrack': {
      const has = state.learningTracks.includes(action.payload.key);
      return {
        ...state,
        learningTracks: has
          ? state.learningTracks.filter((k) => k !== action.payload.key)
          : [...state.learningTracks, action.payload.key],
      };
    }

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
