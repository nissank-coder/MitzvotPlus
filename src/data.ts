import { BlessingCategory, IconName } from './types';
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
  title: string;
  icon: IconName;
  points: number;
  color: string;
  background: string;
}> = [
  { title: 'תפילה', icon: 'prayer', points: 20, color: colors.primary, background: colors.blueSoft },
  { title: 'לימוד תורה', icon: 'book', points: 20, color: colors.purple, background: colors.purpleSoft },
  { title: 'נתינת צדקה', icon: 'charity', points: 15, color: colors.green, background: colors.greenSoft },
  { title: 'מעשה חסד', icon: 'heart', points: 15, color: colors.coral, background: colors.coralSoft },
  { title: 'כיבוד הורים', icon: 'user', points: 15, color: colors.teal, background: colors.mintSoft },
  { title: 'ברכה', icon: 'cup', points: 5, color: colors.gold, background: colors.goldSoft },
];

export const leaderboard = [
  { id: '1', name: 'נועם לוי', initials: 'נל', points: 6420, streak: 18 },
  { id: '2', name: 'דניאל כהן', initials: 'דכ', points: 5880, streak: 14 },
  { id: 'me', name: 'יאיר', initials: 'י', points: 5240, streak: 11 },
  { id: '4', name: 'אורי מזרחי', initials: 'אמ', points: 4910, streak: 9 },
  { id: '5', name: 'אלעד פרץ', initials: 'אפ', points: 4460, streak: 8 },
];
