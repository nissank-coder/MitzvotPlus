import { colors } from '../theme';
import { IconName } from '../types';

export type ActionCategory = 'prayer' | 'torah' | 'blessing' | 'chesed' | 'shabbat' | 'holiday' | 'other';

export type ActionDef = {
  title: string;
  icon: IconName;
  points: number;
  /** How many times a day this action earns points. Further entries are recorded with 0 points. */
  dailyCap: number;
  /** Once a day (per refId, if given) – a duplicate entry is ignored altogether. */
  oncePerDay?: boolean;
  category: ActionCategory;
  /** Only shown to men by default (e.g. tefillin). */
  menOnly?: boolean;
  minyanBonus?: number;
  onTimeBonus?: number;
  /** Shown in the quick-add sheet. */
  quick?: boolean;
  /** The same refId twice on one day is a duplicate (e.g. the same Tehillim portion). */
  uniqueRef?: boolean;
  /** Only completable for a specific content item (id + version). */
  requiresContent?: boolean;
};

/**
 * The scoring table (see docs/SPEC.md §4.2). Everything that earns points is defined here.
 * Keys are stored in history – never rename a key, only add new ones.
 */
export const ACTIONS = {
  // Prayer
  shacharit: { title: 'שחרית', icon: 'sun', points: 25, dailyCap: 1, oncePerDay: true, category: 'prayer', minyanBonus: 10, onTimeBonus: 5, quick: true },
  mincha: { title: 'מנחה', icon: 'prayer', points: 15, dailyCap: 1, oncePerDay: true, category: 'prayer', minyanBonus: 10, quick: true },
  arvit: { title: 'ערבית', icon: 'moon', points: 15, dailyCap: 1, oncePerDay: true, category: 'prayer', minyanBonus: 10, quick: true },
  musaf: { title: 'מוסף', icon: 'prayer', points: 15, dailyCap: 1, oncePerDay: true, category: 'prayer', minyanBonus: 10 },
  tefillin: { title: 'הנחת תפילין', icon: 'scroll', points: 20, dailyCap: 1, oncePerDay: true, category: 'prayer', menOnly: true, quick: true },
  shema: { title: 'קריאת שמע בזמנה', icon: 'book', points: 10, dailyCap: 1, oncePerDay: true, category: 'prayer' },
  birkotHashachar: { title: 'ברכות השחר', icon: 'sun', points: 10, dailyCap: 1, oncePerDay: true, category: 'prayer' },
  hallel: { title: 'הלל', icon: 'star', points: 20, dailyCap: 1, oncePerDay: true, category: 'prayer' },
  tehillim: { title: 'אמירת תהילים', icon: 'book', points: 10, dailyCap: 3, category: 'prayer', quick: true, uniqueRef: true },
  prayer: { title: 'תפילה', icon: 'prayer', points: 20, dailyCap: 3, category: 'prayer' },

  // Blessings
  blessing: { title: 'ברכה', icon: 'cup', points: 2, dailyCap: 150, category: 'blessing', quick: true },
  birkatHamazon: { title: 'ברכת המזון', icon: 'food', points: 8, dailyCap: 4, category: 'blessing', quick: true },

  // Torah
  torahStudy: { title: 'לימוד תורה', icon: 'book', points: 10, dailyCap: 6, category: 'torah', quick: true },
  dailyTorah: { title: 'דבר תורה יומי', icon: 'book', points: 10, dailyCap: 1, oncePerDay: true, category: 'torah', requiresContent: true },
  learningTrack: { title: 'לימוד יומי', icon: 'bookmark', points: 10, dailyCap: 8, oncePerDay: true, category: 'torah' },
  mitzvahStudy: { title: 'לימוד מצווה מתרי״ג', icon: 'scroll', points: 10, dailyCap: 3, oncePerDay: true, category: 'torah' },

  // Kindness
  charity: { title: 'נתינת צדקה', icon: 'charity', points: 15, dailyCap: 3, category: 'chesed', quick: true },
  chesed: { title: 'מעשה חסד', icon: 'heart', points: 15, dailyCap: 5, category: 'chesed', quick: true },
  parents: { title: 'כיבוד הורים', icon: 'user', points: 15, dailyCap: 3, category: 'chesed', quick: true },
  guests: { title: 'הכנסת אורחים', icon: 'home', points: 15, dailyCap: 3, category: 'chesed' },
  visitSick: { title: 'ביקור חולים', icon: 'heart', points: 20, dailyCap: 2, category: 'chesed' },
  cleanSpeech: { title: 'יום של שמירת הלשון', icon: 'shield', points: 20, dailyCap: 1, oncePerDay: true, category: 'chesed' },
  // Round 9 habits (score-3). Values are a proposal for owner approval (scoring-rules.md).
  gratitude: { title: 'הכרת הטוב', icon: 'star', points: 10, dailyCap: 1, oncePerDay: true, category: 'chesed', quick: true },
  speechPractice: { title: 'תרגול מודעות לדיבור', icon: 'shield', points: 10, dailyCap: 1, oncePerDay: true, category: 'chesed' },
  personalHabit: { title: 'הרגל אישי', icon: 'target', points: 10, dailyCap: 1, oncePerDay: true, category: 'other' },

  // Shabbat
  candleLighting: { title: 'הדלקת נרות', icon: 'flame', points: 30, dailyCap: 1, oncePerDay: true, category: 'shabbat' },
  challah: { title: 'הפרשת חלה', icon: 'food', points: 30, dailyCap: 1, oncePerDay: true, category: 'shabbat' },
  shnayimMikra: { title: 'שניים מקרא ואחד תרגום', icon: 'book', points: 20, dailyCap: 1, oncePerDay: true, category: 'shabbat', menOnly: true },
  kiddush: { title: 'קידוש', icon: 'cup', points: 20, dailyCap: 2, category: 'shabbat' },
  shabbatMeal: { title: 'סעודת שבת / חג', icon: 'food', points: 15, dailyCap: 3, category: 'shabbat' },
  havdalah: { title: 'הבדלה', icon: 'flame', points: 20, dailyCap: 1, oncePerDay: true, category: 'shabbat' },
  fullShabbat: { title: 'שבת מלאה', icon: 'crown', points: 30, dailyCap: 1, oncePerDay: true, category: 'shabbat' },

  // Holidays
  omer: { title: 'ספירת העומר', icon: 'calendar', points: 20, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  chanukahCandles: { title: 'הדלקת נרות חנוכה', icon: 'flame', points: 30, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  megillah: { title: 'מקרא מגילה', icon: 'scroll', points: 40, dailyCap: 2, category: 'holiday' },
  mishloachManot: { title: 'משלוח מנות', icon: 'gift', points: 30, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  matanotLaevyonim: { title: 'מתנות לאביונים', icon: 'charity', points: 30, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  purimSeuda: { title: 'סעודת פורים', icon: 'food', points: 30, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  shofar: { title: 'שמיעת קול שופר', icon: 'bell', points: 50, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  sukkah: { title: 'ישיבה בסוכה', icon: 'home', points: 30, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  lulav: { title: 'נטילת ארבעת המינים', icon: 'leaf', points: 40, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  bedikatChametz: { title: 'בדיקת חמץ', icon: 'lightbulb', points: 40, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  seder: { title: 'ליל הסדר', icon: 'cup', points: 50, dailyCap: 1, oncePerDay: true, category: 'holiday' },
  fastDay: { title: 'שמירת הצום', icon: 'clock', points: 30, dailyCap: 1, oncePerDay: true, category: 'holiday' },
} satisfies Record<string, ActionDef>;

export type ActionKey = keyof typeof ACTIONS;

export function actionDef(key: string): ActionDef {
  return (ACTIONS as Record<string, ActionDef>)[key] ?? ACTIONS.prayer;
}

export function isActionKey(key: string): key is ActionKey {
  return key in ACTIONS;
}

/** Bonus for reaching the daily blessing goal (e.g. 100 blessings): once per day, see src/lib/metrics.ts. */
export const BLESSING_GOAL_BONUS = 30;

export const categoryStyle: Record<ActionCategory, { color: string; background: string; title: string }> = {
  prayer: { color: colors.primary, background: colors.blueSoft, title: 'תפילה' },
  torah: { color: colors.purple, background: colors.purpleSoft, title: 'תורה' },
  blessing: { color: colors.gold, background: colors.goldSoft, title: 'ברכות' },
  chesed: { color: colors.coral, background: colors.coralSoft, title: 'חסד' },
  shabbat: { color: colors.teal, background: colors.mintSoft, title: 'שבת' },
  holiday: { color: colors.green, background: colors.greenSoft, title: 'מועדים' },
  other: { color: colors.textMuted, background: colors.background, title: 'אחר' },
};
