import { BlessingCategory, IconName } from '../types';
import { colors } from '../theme';

export const TORAH_TEXT =
  'גם מצווה קטנה מאירה את היום ומוסיפה לו משמעות. כל מעשה טוב, אפילו קטן, יוצר אור בעולם ומחזק את הקשר שלנו עם התורה ועם הקב״ה. כשמצרפים עוד מצווה ועוד מצווה, מתגלה שינוי גדול בחיים - יותר שמחה, יותר מיקוד ויותר טוב סביבנו.';

export const shortcuts: Array<{
  key: 'blessings' | 'torah' | 'speech' | 'prayers' | 'learning' | 'holidays' | 'mitzvot' | 'blessingGuide';
  title: string;
  icon: IconName;
  color: string;
  background: string;
}> = [
  { key: 'prayers', title: 'תפילות וזמנים', icon: 'prayer', color: colors.primary, background: colors.blueSoft },
  { key: 'learning', title: 'לימוד יומי', icon: 'bookmark', color: colors.purple, background: colors.purpleSoft },
  { key: 'blessings', title: '100 ברכות', icon: 'star', color: colors.teal, background: colors.mintSoft },
  { key: 'holidays', title: 'חגים ומועדים', icon: 'calendar', color: colors.green, background: colors.greenSoft },
  { key: 'speech', title: 'שמירת הלשון', icon: 'chat', color: colors.coral, background: colors.coralSoft },
  { key: 'torah', title: 'דבר תורה', icon: 'book', color: colors.purple, background: colors.purpleSoft },
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


/** Demo friends until the social backend exists. Points are weekly points. */
export const demoFriends = [
  { id: 'f1', name: 'נועם לוי', initials: 'נל', weeklyPoints: 640, streak: 18 },
  { id: 'f2', name: 'דניאל כהן', initials: 'דכ', weeklyPoints: 585, streak: 14 },
  { id: 'f3', name: 'אורי מזרחי', initials: 'אמ', weeklyPoints: 410, streak: 9 },
  { id: 'f4', name: 'אלעד פרץ', initials: 'אפ', weeklyPoints: 365, streak: 8 },
];

/** Demo community challenge baseline (mitzvot done by other members this week). */
export const communityChallenge = { goal: 2000, othersThisWeek: 1540 };
