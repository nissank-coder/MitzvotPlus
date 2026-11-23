import { ActionKey, BlessingCategory, IconName } from './types';
import { colors } from './theme';

export const TORAH_TEXT =
  'גם מצווה קטנה מאירה את היום ומוסיפה לו משמעות. כל מעשה טוב, אפילו קטן, יוצר אור בעולם ומחזק את הקשר שלנו עם התורה ועם הקב״ה. כשמצרפים עוד מצווה ועוד מצווה, מתגלה שינוי גדול בחיים - יותר שמחה, יותר מיקוד ויותר טוב סביבנו.';

export const shortcuts: Array<{
  key: 'blessings' | 'torah' | 'speech' | 'charity' | 'prayer';
  title: string;
  icon: IconName;
  color: string;
  background: string;
}> = [
  { key: 'prayer', title: 'תפילה', icon: 'prayer', color: colors.primary, background: colors.blueSoft },
  { key: 'charity', title: 'צדקה', icon: 'charity', color: colors.green, background: colors.greenSoft },
  { key: 'speech', title: 'לשון הרע', icon: 'chat', color: colors.coral, background: colors.coralSoft },
  { key: 'torah', title: 'דבר תורה', icon: 'book', color: colors.purple, background: colors.purpleSoft },
  { key: 'blessings', title: '100 ברכות', icon: 'star', color: colors.teal, background: colors.mintSoft },
];

export const blessingCategoryMeta: Record<
  BlessingCategory,
  { title: string; icon: IconName; color: string; background: string; sample: string }
> = {
  enjoyment: {
    title: 'ברכות הנהנין',
    icon: 'food',
    color: colors.teal,
    background: colors.mintSoft,
    sample: 'ברכה על אכילה או שתייה',
  },
  prayer: {
    title: 'ברכות התפילה',
    icon: 'book',
    color: colors.primary,
    background: colors.blueSoft,
    sample: 'ברכה בתפילה',
  },
  mitzvah: {
    title: 'ברכות על מצוות',
    icon: 'scroll',
    color: colors.purple,
    background: colors.purpleSoft,
    sample: 'ברכה על מצווה',
  },
  other: {
    title: 'אחרות',
    icon: 'ellipsis',
    color: colors.gold,
    background: colors.goldSoft,
    sample: 'ברכה אחרת',
  },
};

export const quickMitzvot: Array<{
  key: ActionKey;
  title: string;
  icon: IconName;
  points: number;
  color: string;
  background: string;
}> = [
  { key: 'prayer', title: 'תפילה', icon: 'prayer', points: 20, color: colors.primary, background: colors.blueSoft },
  { key: 'torahStudy', title: 'לימוד תורה', icon: 'book', points: 20, color: colors.purple, background: colors.purpleSoft },
  { key: 'charity', title: 'נתינת צדקה', icon: 'charity', points: 15, color: colors.green, background: colors.greenSoft },
  { key: 'chesed', title: 'מעשה חסד', icon: 'heart', points: 15, color: colors.coral, background: colors.coralSoft },
  { key: 'parents', title: 'כיבוד הורים', icon: 'user', points: 15, color: colors.teal, background: colors.mintSoft },
  { key: 'blessing', title: 'ברכה', icon: 'cup', points: 5, color: colors.gold, background: colors.goldSoft },
];

/** Demo friends until the social backend exists. Points are weekly points. */
export const demoFriends = [
  { id: 'f1', name: 'נועם לוי', initials: 'נל', weeklyPoints: 640, streak: 18 },
  { id: 'f2', name: 'דניאל כהן', initials: 'דכ', weeklyPoints: 585, streak: 14 },
  { id: 'f3', name: 'אורי מזרחי', initials: 'אמ', weeklyPoints: 410, streak: 9 },
  { id: 'f4', name: 'אלעד פרץ', initials: 'אפ', weeklyPoints: 365, streak: 8 },
];

/** Demo community challenge baseline (mitzvot done by other members this week). */
export const communityChallenge = { goal: 2000, othersThisWeek: 1540 };
