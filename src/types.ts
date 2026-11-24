export type TabKey = 'home' | 'content' | 'community' | 'profile';
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
  rules?: 'score-2';
  /** Blessings recorded as part of a confirmed bundle for another entry (e.g. a prayer). */
  bundleOf?: string;
};

/** Goals in force from a given day on (so changing a goal never rewrites past days). */
export type GoalSnapshot = { from: string; dailyGoal: number; weeklyGoal: number; blessingGoal: number };

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
