/** Daily learning tracks – data only, so it can be loaded without the learning schedules. */
export type TrackDef = {
  key: string;
  title: string;
  description: string;
  /** hebcal DailyLearning calendar name, if the schedule comes from hebcal. */
  hebcal?: string;
};

export const TRACKS: TrackDef[] = [
  { key: 'dailyHalacha', title: 'הלכה יומית', description: 'סימן אחד מקיצור שולחן ערוך בכל יום' },
  { key: 'chofetzchaim', title: 'חפץ חיים יומי', description: 'הלכות שמירת הלשון', hebcal: 'chofetzchaim' },
  { key: 'psalms', title: 'תהילים יומי', description: 'ספר תהילים בחודש', hebcal: 'psalms' },
  { key: 'rambam1', title: 'רמב״ם יומי', description: 'פרק אחד ליום', hebcal: 'rambam1' },
  { key: 'mishnayomi', title: 'משנה יומית', description: 'שתי משניות ליום', hebcal: 'mishnayomi' },
  { key: 'dafyomi', title: 'דף יומי', description: 'תלמוד בבלי – דף ליום', hebcal: 'dafyomi' },
  { key: 'nachyomi', title: 'נ״ך יומי', description: 'פרק נביאים וכתובים ליום', hebcal: 'nachyomi' },
];

export const DEFAULT_TRACKS = ['dailyHalacha', 'chofetzchaim', 'psalms'];

