import { DEMO_CONTENT } from '../config/features';
import { nusachLabel, siddurUrl } from '../data/siddur';
import type { Nusach } from '../types';

/**
 * Which nusach can be read INSIDE the app (round 14, review v4 §4). The preference the user chose is
 * always kept; what the app can show is said plainly next to the choice and in the siddur.
 *  - Sefard: the owner-approved pack (Sefaria, 2026-11-23), pending rabbinic review – shown with that notice.
 *  - Ashkenaz: a pack built the same way (scripts/content/fetch-siddur-ashkenaz.mjs: Daat, Public
 *    Domain; Metsudah, CC-BY), NOT approved for distribution yet – internal builds only.
 *  - Edot HaMizrach: no pack yet – the siddur on Sefaria, marked as an outside link.
 */
export type NusachAvailability = 'in-app' | 'internal-review' | 'outside-link';

export const NUSACH_AVAILABILITY: Record<Nusach, NusachAvailability> = {
  sefard: 'in-app',
  ashkenaz: DEMO_CONTENT ? 'internal-review' : 'outside-link',
  edot: 'outside-link',
};

/** The nusach whose pack the siddur shows for a preference. */
export function siddurPackFor(pref: Nusach): 'sefard' | 'ashkenaz' {
  return pref === 'ashkenaz' && NUSACH_AVAILABILITY.ashkenaz !== 'outside-link' ? 'ashkenaz' : 'sefard';
}

/** One line for the profile and the siddur: what this build can show for the preference. */
export function nusachAvailabilityText(pref: Nusach): string {
  switch (NUSACH_AVAILABILITY[pref]) {
    case 'in-app':
      return `נוסח ${nusachLabel[pref]} זמין בתוך האפליקציה, גם בלי אינטרנט.`;
    case 'internal-review':
      return `נוסח ${nusachLabel[pref]} זמין בגרסת בדיקה פנימית בלבד, וממתין לאישור ולבדיקה רבנית.`;
    default:
      return `בתוך האפליקציה זמין כרגע נוסח ספרד בלבד. נוסח ${nusachLabel[pref]} נפתח בספריא, באתר חיצוני. ההעדפה שלך נשמרת.`;
  }
}

export const outsideSiddurUrl = (pref: Nusach) => siddurUrl[pref];
