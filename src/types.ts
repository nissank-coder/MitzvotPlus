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

export type MitzvahLog = {
  id: string;
  title: string;
  time: string;
  icon: IconName;
  points: number;
  createdAt: number;
};

export type BlessingCategory = 'enjoyment' | 'prayer' | 'mitzvah' | 'other';

export type BlessingLog = {
  id: string;
  title: string;
  time: string;
  category: BlessingCategory;
  createdAt: number;
};

export type AppState = {
  version: 1;
  todayKey: string;
  userName: string;
  points: number;
  dailyGoal: number;
  dailyLogs: MitzvahLog[];
  weeklyGoal: number;
  weeklyProgress: number;
  blessingGoal: number;
  blessingCounts: Record<BlessingCategory, number>;
  blessingLogs: BlessingLog[];
  lashonHaraSince: number;
  lashonHaraBestMs: number;
  lashonHaraResets: number;
  torahSaved: boolean;
  torahCompletedToday: boolean;
  torahStreak: number;
  reflection: string;
};
