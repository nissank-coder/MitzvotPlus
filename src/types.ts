export type TabKey = 'home' | 'goals' | 'community' | 'profile';
export type FeatureKey = 'blessings' | 'torah' | 'speech' | null;

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

/** Stable identifier of a quick action, used for badges and statistics. */
export type ActionKey = 'prayer' | 'torahStudy' | 'charity' | 'chesed' | 'parents' | 'blessing' | 'dailyTorah';

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
};

export type AppSettings = {
  notifications: boolean;
  privateProfile: boolean;
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
  lashonHaraSince: number;
  lashonHaraBestMs: number;
  lashonHaraResets: number;
  torahSaved: boolean;
  /** Personal reflection per day, keyed by YYYY-MM-DD. */
  reflections: Record<string, string>;
  settings: AppSettings;
  joinedGroups: Record<string, boolean>;
};
