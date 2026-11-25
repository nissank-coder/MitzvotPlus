import { blessingCategoryMeta } from '../data';
import { ActionKey } from '../data/actions';
import { DEFAULT_CITY_ID } from '../data/locations';
import { DEFAULT_TRACKS } from '../data/tracks';
import { DAY_MS, localDateKey } from '../lib/dates';
import { ActionInput, buildLog } from '../lib/scoring';
import { goalsOn, withGoals } from '../lib/metrics';
import { cleanHabits } from '../lib/habits';
import { challengeById, challengeWindow } from '../lib/challenges';
import { logFromRemote, RemoteEvent } from '../sync/engine';
import { emptyTimer, resetTimer, SpeechTimer, startTimer, undoReset } from '../lib/speechTimer';
import { ActivityLog, AppSettings, AppState, Award, BlessingCategory, GoalSnapshot, HabitSelection, IconName, LogKind, UserProfile } from '../types';

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
    speech: emptyTimer(),
    savedContent: [],
    goalHistory: [{ from: '0000-00-00', dailyGoal: 12, weeklyGoal: 60, blessingGoal: 100 }],
    locationHistory: [{ from: '0000-00-00', cityId: DEFAULT_CITY_ID }],
    challenges: [],
    awards: [],
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
    if (rand() > 0.15) add({ key: 'torahStudy' }, at(20));
  }

  return {
    ...fresh,
    onboarded: true,
    userName: 'יאיר',
    memberSince: now - 120 * DAY_MS,
    logs: logs.sort((a, b) => b.createdAt - a.createdAt),
    // Demo only; no preseeded "best" record (spec §3).
    speech: { ...emptyTimer(), since: now - (5 * DAY_MS + 14 * 60 * 60 * 1000) },
  };
}

/* ------------------------- Loading & migration ------------------------- */

type LegacySpeechFields = { lashonHaraSince?: number; lashonHaraBestMs?: number; lashonHaraResets?: number };

/** Earlier versions stored three flat fields and started the timer at install. */
function legacySpeech(old: LegacySpeechFields): SpeechTimer {
  if (typeof old.lashonHaraSince !== 'number') return emptyTimer();
  const resets = old.lashonHaraResets ?? 0;
  return {
    since: old.lashonHaraSince,
    bestMs: old.lashonHaraBestMs ?? 0,
    resets,
    // The sum of past periods was never stored, so an average cannot be computed honestly.
    completedMs: resets === 0 ? 0 : null,
    undo: null,
  };
}

type V1Log = { id: string; title: string; icon: IconName; points: number; createdAt: number };
type V1State = LegacySpeechFields & {
  version?: 1;
  todayKey?: string;
  userName?: string;
  points?: number;
  dailyGoal?: number;
  weeklyGoal?: number;
  blessingGoal?: number;
  dailyLogs?: V1Log[];
  blessingLogs?: Array<{ createdAt: number; category: BlessingCategory }>;
  torahSaved?: boolean;
  reflection?: string;
};

/** Goal history for data saved before goals were versioned: the stored goals applied all along. */
function initialGoalHistory(g: { dailyGoal: number; weeklyGoal: number; blessingGoal: number }): GoalSnapshot[] {
  return [{ from: '0000-00-00', dailyGoal: g.dailyGoal, weeklyGoal: g.weeklyGoal, blessingGoal: g.blessingGoal }];
}

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
  const goals = {
    dailyGoal: old.dailyGoal ?? fresh.dailyGoal,
    weeklyGoal: old.weeklyGoal ?? fresh.weeklyGoal,
    blessingGoal: old.blessingGoal ?? fresh.blessingGoal,
  };
  return {
    ...fresh,
    onboarded: true,
    userName: old.userName || 'משתמש',
    legacyPoints: Math.max(0, (old.points ?? 0) - loggedPoints),
    ...goals,
    goalHistory: initialGoalHistory(goals),
    logs,
    speech: legacySpeech(old),
    // The old flag was global (not tied to an item) and only test content existed: not carried over.
    reflections: old.reflection && old.todayKey ? { [old.todayKey]: old.reflection } : {},
  };
}

export function loadState(raw: string | null, now = Date.now()): AppState {
  if (!raw) return createFreshState(now);
  const parsed = JSON.parse(raw) as Partial<AppState> | V1State;
  if (!parsed || typeof parsed !== 'object') return createFreshState(now);
  if (parsed.version !== 2) return migrateV1(parsed as V1State, now);
  const fresh = createFreshState(now);
  const { lashonHaraSince: _a, lashonHaraBestMs: _b, lashonHaraResets: _c, torahSaved: _t, ...value } = parsed as Partial<AppState> &
    LegacySpeechFields & { torahSaved?: boolean };
  void _t;
  void _a, void _b, void _c;
  const legacyFields: LegacySpeechFields = { lashonHaraSince: _a, lashonHaraBestMs: _b, lashonHaraResets: _c };
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
    speech: value.speech ?? legacySpeech(legacyFields),
    savedContent: Array.isArray(value.savedContent) ? value.savedContent : [],
    // Round 9: existing users keep their history and goals; habits are offered, never forced.
    challenges: Array.isArray(value.challenges) ? value.challenges : [],
    awards: Array.isArray(value.awards) ? value.awards : [],
    locationHistory:
      Array.isArray(value.locationHistory) && value.locationHistory.length > 0
        ? value.locationHistory
        : [{ from: '0000-00-00', cityId: value.profile?.cityId ?? fresh.profile.cityId }],
    goalHistory:
      Array.isArray(value.goalHistory) && value.goalHistory.length > 0
        ? value.goalHistory
        : initialGoalHistory({
            dailyGoal: value.dailyGoal ?? fresh.dailyGoal,
            weeklyGoal: value.weeklyGoal ?? fresh.weeklyGoal,
            blessingGoal: value.blessingGoal ?? fresh.blessingGoal,
          }),
  };
}

/* ------------------------------- Reducer ------------------------------- */

/**
 * Entries a blessing bundle may be confirmed for (prayers and Birkat Hamazon). A product
 * allowlist, not a count table: the number of blessings is always what the user confirms.
 */
export const BUNDLE_SOURCES: readonly ActionKey[] = ['birkotHashachar', 'shacharit', 'mincha', 'arvit', 'musaf', 'birkatHamazon'];
export const MAX_BUNDLE = 30;

export type Action =
  | { type: 'hydrate'; payload: AppState }
  | {
      type: 'completeOnboarding';
      payload: { userName: string; dailyGoal: number; profile: Partial<UserProfile>; dateKey?: string; habits?: HabitSelection[] };
    }
  | { type: 'setHabits'; payload: { habits: HabitSelection[]; habitTarget?: number }; dateKey: string }
  | { type: 'joinChallenge'; payload: { definitionId: string; now: number }; dateKey: string }
  | { type: 'leaveChallenge'; payload: { instanceId: string; now: number } }
  | { type: 'completeChallenges'; payload: { instanceIds: string[]; now: number } }
  | { type: 'grantAwards'; payload: Award[] }
  | { type: 'applyRemoteEvents'; payload: RemoteEvent[] }
  | { type: 'resetSyncCursor' }
  | { type: 'addAction'; payload: ActionInput }
  | { type: 'addActions'; payload: ActionInput[]; markBackfilled?: string[] }
  | { type: 'removeLog'; payload: { id: string } }
  | { type: 'setBlessingBundle'; payload: { sourceLogId: string; count: number; now: number } }
  | { type: 'startSpeech'; now?: number }
  | { type: 'resetSpeech'; now?: number }
  | { type: 'undoSpeechReset'; now?: number }
  | { type: 'toggleSavedContent'; payload: { ref: string } }
  | { type: 'setReflection'; payload: { dateKey: string; text: string } }
  | { type: 'updateGoals'; payload: Partial<Pick<AppState, 'dailyGoal' | 'weeklyGoal' | 'blessingGoal' | 'userName'>>; dateKey?: string }
  | { type: 'updateSettings'; payload: Partial<AppSettings> }
  | { type: 'updateProfile'; payload: Partial<UserProfile>; dateKey?: string }
  | { type: 'toggleTrack'; payload: { key: string } }
  | { type: 'toggleGroup'; payload: { key: string } }
  | { type: 'loadDemo' }
  | { type: 'resetAll' };

function prepend(state: AppState, log: ActivityLog): AppState {
  return { ...state, logs: [log, ...state.logs] };
}

/** Habits of the current goal, carried over when another goal value changes. */
function carryHabits(state: AppState): Partial<GoalSnapshot> {
  const last = state.goalHistory[state.goalHistory.length - 1];
  return last?.habits ? { habits: last.habits, habitTarget: last.habitTarget } : {};
}

const clampGoal = (value: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, value)));

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'hydrate':
      return action.payload;

    case 'completeOnboarding': {
      const habits = cleanHabits(action.payload.habits ?? []);
      const dailyGoal = clampGoal(action.payload.dailyGoal, 1, 50);
      const weeklyGoal = clampGoal(action.payload.dailyGoal * 5, 5, 300);
      return {
        ...state,
        onboarded: true,
        userName: action.payload.userName.trim() || 'משתמש',
        dailyGoal,
        weeklyGoal,
        // The first goals apply from the start; there is no earlier history to keep.
        goalHistory: [
          {
            from: '0000-00-00',
            dailyGoal,
            weeklyGoal,
            blessingGoal: state.blessingGoal,
            ...(habits.length > 0 ? { habits, habitTarget: habits.length } : {}),
          },
        ],
        locationHistory: [{ from: '0000-00-00', cityId: action.payload.profile.cityId ?? state.profile.cityId }],
        memberSince: Date.now(),
        profile: { ...state.profile, ...action.payload.profile },
      };
    }

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
      // Removing an entry also removes the blessing bundle confirmed for it (no orphans).
      return {
        ...state,
        logs: state.logs.filter((log) => log.id !== action.payload.id && log.bundleOf !== action.payload.id),
      };

    case 'setBlessingBundle': {
      // Only for a prayer / composite blessing, only a whole number 0–MAX the user confirmed.
      // Idempotent: the same number changes nothing; a new number keeps the rows that stay
      // (stable ids) and adds or removes only the difference. Never stacks on another bundle.
      const { sourceLogId, count } = action.payload;
      const source = state.logs.find((l) => l.id === sourceLogId);
      if (!source || source.bundleOf || !source.actionKey || !BUNDLE_SOURCES.includes(source.actionKey)) return state;
      if (!Number.isInteger(count) || count < 0 || count > MAX_BUNDLE) return state;
      const existing = state.logs.filter((l) => l.bundleOf === source.id);
      const index = (l: ActivityLog) => Number(l.refId?.split(':')[2] ?? -1);
      const keep = existing.filter((l) => index(l) >= 0 && index(l) < count);
      if (keep.length === count && existing.length === count) return state;
      const have = new Set(keep.map(index));
      let logs = state.logs.filter((l) => l.bundleOf !== source.id || keep.includes(l));
      for (let i = 0; i < count; i += 1) {
        if (have.has(i)) continue;
        const log = buildLog(logs, {
          key: 'blessing',
          category: 'prayer',
          title: `ברכה ב${source.title}`,
          dateKey: source.dateKey,
          bundleOf: source.id,
          refId: `bundle:${source.id}:${i}`,
          now: action.payload.now,
        });
        if (log) logs = [log, ...logs];
      }
      return { ...state, logs };
    }

    case 'startSpeech':
      return { ...state, speech: startTimer(state.speech, action.now ?? Date.now()) };

    case 'resetSpeech':
      return { ...state, speech: resetTimer(state.speech, action.now ?? Date.now()) };

    case 'undoSpeechReset':
      return { ...state, speech: undoReset(state.speech, action.now ?? Date.now()) };

    case 'toggleSavedContent': {
      const has = state.savedContent.includes(action.payload.ref);
      return {
        ...state,
        savedContent: has ? state.savedContent.filter((r) => r !== action.payload.ref) : [...state.savedContent, action.payload.ref],
      };
    }

    case 'setReflection':
      return { ...state, reflections: { ...state.reflections, [action.payload.dateKey]: action.payload.text } };

    case 'updateGoals': {
      const p = action.payload;
      const goals = {
        dailyGoal: p.dailyGoal !== undefined ? clampGoal(p.dailyGoal, 1, 50) : state.dailyGoal,
        weeklyGoal: p.weeklyGoal !== undefined ? clampGoal(p.weeklyGoal, 5, 300) : state.weeklyGoal,
        blessingGoal: p.blessingGoal !== undefined ? clampGoal(p.blessingGoal, 10, 300) : state.blessingGoal,
      };
      const changed =
        goals.dailyGoal !== state.dailyGoal || goals.weeklyGoal !== state.weeklyGoal || goals.blessingGoal !== state.blessingGoal;
      return {
        ...state,
        userName: p.userName !== undefined ? p.userName.trim() || state.userName : state.userName,
        ...goals,
        // A goal change applies from today on; past days keep the goals they were measured with.
        goalHistory: changed
          ? withGoals(state.goalHistory, action.dateKey ?? localDateKey(Date.now()), { ...carryHabits(state), ...goals })
          : state.goalHistory,
      };
    }

    case 'setHabits': {
      // A habit change applies from today on; earlier days keep the habits they were measured with.
      const habits = cleanHabits(action.payload.habits);
      if (habits.length === 0) return state;
      const target = Math.min(habits.length, Math.max(1, Math.round(action.payload.habitTarget ?? habits.length)));
      const current = goalsOn(state.goalHistory, action.dateKey);
      return {
        ...state,
        goalHistory: withGoals(state.goalHistory, action.dateKey, {
          dailyGoal: current.dailyGoal,
          weeklyGoal: current.weeklyGoal,
          blessingGoal: current.blessingGoal,
          habits,
          habitTarget: target,
        }),
      };
    }

    case 'joinChallenge': {
      const def = challengeById(action.payload.definitionId);
      if (!def || def.scope !== 'personal') return state;
      const busy = state.challenges.some(
        (c) => c.definitionId === def.id && !c.completedAt && !c.leftAt && action.dateKey < c.end,
      );
      if (busy) return state;
      const { start, end } = challengeWindow(def, action.dateKey);
      return {
        ...state,
        challenges: [
          ...state.challenges,
          {
            instanceId: `ch-${def.id}-${action.payload.now.toString(36)}`,
            definitionId: def.id,
            definitionVersion: def.version,
            joinedAt: action.payload.now,
            start,
            end,
            target: def.target,
          },
        ],
      };
    }

    case 'leaveChallenge':
      return {
        ...state,
        challenges: state.challenges.map((c) =>
          c.instanceId === action.payload.instanceId && !c.completedAt && !c.leftAt ? { ...c, leftAt: action.payload.now } : c,
        ),
      };

    case 'completeChallenges': {
      const ids = new Set(action.payload.instanceIds);
      if (!state.challenges.some((c) => ids.has(c.instanceId) && !c.completedAt && !c.leftAt)) return state;
      return {
        ...state,
        challenges: state.challenges.map((c) =>
          ids.has(c.instanceId) && !c.completedAt && !c.leftAt ? { ...c, completedAt: action.payload.now } : c,
        ),
      };
    }

    case 'grantAwards': {
      const fresh = action.payload.filter(
        (a) => !state.awards.some((x) => x.achievementId === a.achievementId && x.version === a.version),
      );
      return fresh.length === 0 ? state : { ...state, awards: [...state.awards, ...fresh] };
    }

    case 'applyRemoteEvents': {
      // Entries from other devices of the same account (round 12 sync). Idempotent: an event already
      // applied (or made here) changes nothing. A deletion from another device wins.
      const sync = state.sync ?? { cursor: 0, remoteRemoved: [], lastSyncAt: null };
      const ids = new Set(state.logs.map((l) => l.id));
      let logs = state.logs;
      let cursor = sync.cursor;
      const removed = new Set(sync.remoteRemoved);
      const voided = new Set<string>();
      for (const ev of action.payload) {
        cursor = Math.max(cursor, ev.seq);
        if (ev.operation === 'void' && ev.target_event_id) voided.add(ev.target_event_id);
      }
      for (const ev of action.payload) {
        if (ev.operation !== 'create' || ids.has(ev.event_id) || voided.has(ev.event_id) || removed.has(ev.event_id)) continue;
        const log = logFromRemote(ev);
        if (log) {
          logs = [log, ...logs];
          ids.add(log.id);
        }
      }
      if (voided.size > 0) {
        logs = logs.filter((l) => !voided.has(l.id) && !(l.bundleOf && voided.has(l.bundleOf)));
        for (const id of voided) removed.add(id);
      }
      return { ...state, logs, sync: { cursor, remoteRemoved: [...removed].slice(-500), lastSyncAt: Date.now() } };
    }

    case 'resetSyncCursor':
      return { ...state, sync: { cursor: 0, remoteRemoved: [], lastSyncAt: null } };

    case 'updateSettings':
      return { ...state, settings: { ...state.settings, ...action.payload } };

    case 'updateProfile': {
      const cityId = action.payload.cityId;
      const moved = cityId !== undefined && cityId !== state.profile.cityId;
      const from = action.dateKey ?? localDateKey(Date.now());
      return {
        ...state,
        profile: { ...state.profile, ...action.payload },
        // A new city applies from today on; earlier days keep the city they were measured in.
        locationHistory: moved
          ? [...state.locationHistory.filter((l) => l.from < from), { from, cityId }]
          : state.locationHistory,
      };
    }

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
