import { DEMO_CONTENT } from '../config/features';

/**
 * Daily practical idea (round 9, content). Only APPROVED items may appear in production; there are
 * none yet (D08), so production shows nothing here. Development / internal demo builds show the
 * DRAFT suggestions, clearly labelled. The drafts module is imported only when DEMO_CONTENT is on,
 * so it is not part of a production bundle (check:release verifies the marker is absent).
 */
export type PracticalIdea = {
  id: string;
  category: 'chesed' | 'learning' | 'speech' | 'gratitude' | 'habits';
  /** Habit this idea supports (its "I did it" records that habit's action). */
  habit: string;
  text: string;
  status: 'APPROVED' | 'DRAFT';
};

export const PRACTICAL_CATEGORY: Record<PracticalIdea['category'], string> = {
  chesed: 'חסד',
  learning: 'התמדה בלימוד',
  speech: 'מודעות לדיבור',
  gratitude: 'הכרת הטוב',
  habits: 'הרגלים',
};

const APPROVED_PRACTICAL: PracticalIdea[] = [];

export async function loadPracticalIdeas(): Promise<PracticalIdea[]> {
  if (!DEMO_CONTENT) return APPROVED_PRACTICAL;
  const { PRACTICAL_DRAFTS } = await import('./practicalDrafts');
  return [...APPROVED_PRACTICAL, ...PRACTICAL_DRAFTS.map((d) => ({ ...d, status: 'DRAFT' as const }))];
}

/**
 * The idea for a day: stable for the day (by date), preferring ideas linked to the user's habits.
 */
export function ideaForDay(ideas: PracticalIdea[], dateKey: string, habits: string[]): PracticalIdea | null {
  const linked = ideas.filter((i) => habits.includes(i.habit));
  const pool = linked.length > 0 ? linked : ideas;
  if (pool.length === 0) return null;
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return pool[day % pool.length] ?? null;
}
