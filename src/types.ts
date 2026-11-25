/** Bottom navigation (round 9): היום | התקדמות | + | מסלולים | אני. 'community' is dev-only. */
export type TabKey = 'today' | 'progress' | 'tracks' | 'me' | 'community';
export type FeatureKey =
  | 'blessings'
  | 'torah'
  | 'speech'
  | 'goals'
  | 'prayers'
  | 'blessingGuide'
  | 'learning'
  | 'mitzvot'
  | 'holidays'
  | 'siddur'
  | 'tehillim'
  | null;

export type IconName =
  | 'home'
  | 'target'
  | 'plus'
  | 'community'
  | 'user'
  | 'book'
  | 'chat'
  | 'gift'
  | 'coin'
  | 'trophy'
  | 'check'
  | 'clock'
  | 'calendar'
  | 'heart'
  | 'prayer'
  | 'charity'
  | 'flame'
  | 'bookmark'
  | 'share'
  | 'play'
  | 'pause'
  | 'reset'
  | 'lightbulb'
  | 'chart'
  | 'crown'
  | 'settings'
  | 'chevronLeft'
  | 'chevronRight'
  | 'close'
  | 'leaf'
  | 'cup'
  | 'shield'
  | 'star'
  | 'bell'
  | 'sun'
  | 'moon'
  | 'food'
  | 'scroll'
  | 'ellipsis'
  | 'edit'
  | 'lock'
  | 'logout';

export type BlessingCategory = 'enjoyment' | 'prayer' | 'mitzvah' | 'other';

export type LogKind = 'mitzvah' | 'blessing' | 'torah';

export type { ActionKey } from './data/actions';
import type { ActionKey } from './data/actions';

export type Gender = 'male' | 'female';
export type Nusach = 'ashkenaz' | 'sefard' | 'edot';

export type UserProfile = {
  gender: Gender;
  nusach: Nusach;
  cityId: string;
};

/** A single recorded mitzvah / blessing / learning session. History is kept permanently. */
export type ActivityLog = {
  id: string;
  title: string;
  icon: IconName;
  points: number;
  createdAt: number;
  /** Local YYYY-MM-DD of `createdAt`. */
  dateKey: string;
  kind: LogKind;
  actionKey?: ActionKey;
  category?: BlessingCategory;
  refId?: string;
  minyan?: boolean;
  /** Recorded after Shabbat / Yom Tov. */
  backfill?: boolean;
  /** Daily cap reached – recorded without points. */
  capped?: boolean;
  /** When it was entered in the app (UTC ms); createdAt is the claimed time of the deed. */
  recordedAt?: number;
  /** Calendar settings snapshot used to classify the event (policy version, city, zone). */
  context?: { policyVersion: string; cityId: string; tzid: string; il: boolean; candleMins: number };
  /** Content the action refers to (stable id + version). */
  content?: { id: string; version: string };
  /** Recorded within the proper time (stored so the score can be recomputed). */
  onTime?: boolean;
  /** Scoring rules the entry is scored with. Absent = recorded before score-2: points frozen as stored. */
  rules?: 'score-2' | 'score-3';
  /** Blessings recorded as part of a confirmed bundle for another entry (e.g. a prayer). */
  bundleOf?: string;
  /** Came from another device of the same account (round 12): never queued for upload again. */
  remote?: true;
};

/** A habit the user chose, with how many days a week it is meant for (7 = every day). */
export type HabitSelection = { id: string; perWeek: number; label?: string };

/**
 * Goals in force from a given day on (so changing a goal never rewrites past days).
 * With `habits`, the daily goal is "habitTarget habits done"; without, the older
 * "dailyGoal distinct actions" goal applies (users who have not chosen habits yet).
 */
export type GoalSnapshot = {
  from: string;
  dailyGoal: number;
  weeklyGoal: number;
  blessingGoal: number;
  habits?: HabitSelection[];
  habitTarget?: number;
};

/** A personal challenge the user joined (definition frozen by id + version at joining). */
export type ChallengeEnrollment = {
  instanceId: string;
  definitionId: string;
  definitionVersion: number;
  joinedAt: number;
  /** First day counted (the joining day) and end, exclusive. YYYY-MM-DD. */
  start: string;
  end: string;
  target: number;
  /** Parameters frozen at joining (e.g. blessing threshold). */
  params?: Record<string, number>;
  leftAt?: number;
  /** Set once, after the completing entry was saved on the device. */
  completedAt?: number;
};

/** An achievement earned (kept once earned; one per id + version). */
export type Award = { achievementId: string; version: number; earnedAt: number; rulesVersion: string };

export type AppSettings = {
  notifications: boolean;
  privateProfile: boolean;
  /** Font size of prayer / Tehillim text (px). */
  readerFontSize?: number;
};

export type AppState = {
  version: 2;
  onboarded: boolean;
  userName: string;
  memberSince: number;
  /** Points carried over from the v1 prototype, whose history was not stored. */
  legacyPoints: number;
  dailyGoal: number;
  weeklyGoal: number;
  blessingGoal: number;
  logs: ActivityLog[];
  /** Private speech-guard timer – local only (see src/lib/speechTimer.ts). */
  speech: import('./lib/speechTimer').SpeechTimer;
  /** Content items the user saved, as contentRef `id@version` (replaces the global torahSaved flag). */
  savedContent: string[];
  /** Goal history; the last entry is the current goal. */
  goalHistory: GoalSnapshot[];
  /** Sync bookkeeping (round 12): pull cursor and entries removed by another device. */
  sync?: { cursor: number; remoteRemoved: string[]; lastSyncAt: number | null };
  /** Personal challenges joined (round 9, C1). */
  challenges: ChallengeEnrollment[];
  /** Achievements earned (round 9, C1). */
  awards: Award[];
  /** City in force from a day on: past rest days keep the city they were in (round 8, A06). */
  locationHistory: Array<{ from: string; cityId: string }>;
  /** Personal reflection per day, keyed by YYYY-MM-DD. */
  reflections: Record<string, string>;
  settings: AppSettings;
  joinedGroups: Record<string, boolean>;
  profile: UserProfile;
  /** Daily learning tracks the user follows (see src/lib/learning.ts). */
  learningTracks: string[];
  /** Shabbat / Yom Tov days already filled in after the fact. */
  backfilledRestDays: string[];
};
