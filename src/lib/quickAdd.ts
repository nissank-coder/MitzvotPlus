import { ActionCategory, ActionKey, actionDef, categoryStyle } from '../data/actions';
import type { Gender } from '../types';
import { quickActions } from './scoring';

/**
 * The add sheet's content (design round 1). Every item is shown with the action's OWN name
 * (שחרית, מנחה, ערבית…); the category is only the group heading. Regression: the sheet used to
 * merge the category style into the action, so the category title ("תפילה", "ברכות") replaced
 * the action's title on five prayer tiles and two blessing tiles.
 */
export type QuickAddItem = {
  key: ActionKey;
  title: string;
  /** Needs one more choice before it is recorded (prayers with a minyan bonus: in a minyan or not). */
  detail: 'minyan' | null;
  /** Recorded at most once a day: shown as done once recorded. */
  oncePerDay: boolean;
};
export type QuickAddGroup = { category: ActionCategory; title: string; items: QuickAddItem[] };

const ORDER: ActionCategory[] = ['prayer', 'blessing', 'torah', 'chesed', 'shabbat', 'holiday', 'other'];

export function quickAddGroups(gender: Gender): QuickAddGroup[] {
  const items = quickActions.filter((k) => !actionDef(k).menOnly || gender === 'male');
  return ORDER.map((category) => ({
    category,
    title: categoryStyle[category].title,
    items: items
      .filter((k) => actionDef(k).category === category)
      .map((key) => {
        const def = actionDef(key);
        return { key, title: def.title, detail: def.minyanBonus ? ('minyan' as const) : null, oncePerDay: Boolean(def.oncePerDay) };
      }),
  })).filter((g) => g.items.length > 0);
}
