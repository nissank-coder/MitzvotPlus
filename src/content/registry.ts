import { TORAH_TEXT } from '../data';
import { DEMO_CONTENT } from '../config/features';
import dvarTorahPack from './packs/dvar-torah.json';
import { partitionContent } from './validate';

/**
 * Bundled content with stable IDs and versions (spec §3, §10, decision D08).
 * Only items with approval 'APPROVED' are real content. 'TEST_ONLY' items are placeholders for
 * development: they claim no source and are labelled as temporary wherever they appear.
 * Every item must have a row in docs/mobile-readiness/content_license_manifest.csv.
 */
export type ContentItem = {
  id: string;
  version: string;
  kind: 'dvar-torah';
  language: 'he';
  title: string;
  body: string;
  /** Exact source of the text; null when there is none (never invent one). */
  source: { title: string; ref?: string; url?: string } | null;
  license: { id: string; attribution?: string; url?: string };
  approval: 'APPROVED' | 'TEST_ONLY';
  /** Author as given by the source; omitted when unknown. */
  author?: string;
  /** Who approved it and when (required for APPROVED; the reviewer is named by the owner, D08). */
  review?: { reviewer: string; reviewedAt: string; notes?: string };
};

const TEST_CONTENT: ContentItem[] = [
  {
    id: 'dvar-torah/test-placeholder-1',
    version: '1',
    kind: 'dvar-torah',
    language: 'he',
    title: 'מחשבה יומית',
    body: TORAH_TEXT,
    source: null,
    license: { id: 'TEST-ONLY-NOT-FOR-DISTRIBUTION' },
    approval: 'TEST_ONLY',
  },
];

/**
 * Approved content from src/content/packs/dvar-torah.json (empty until D08 names a reviewer and
 * content is approved). Items that fail validation are dropped – fail closed; the content test
 * fails the build when this happens.
 */
const { valid: APPROVED_CONTENT, rejected: REJECTED_CONTENT } = partitionContent(
  (dvarTorahPack.items as ContentItem[]).filter((c) => c.kind === 'dvar-torah'),
);
export { REJECTED_CONTENT };

/**
 * What the app may show. TEST_ONLY items exist only in development/demo builds; a production build
 * never contains them (the release check fails if it does).
 */
export const CONTENT: ContentItem[] = DEMO_CONTENT ? [...APPROVED_CONTENT, ...TEST_CONTENT] : APPROVED_CONTENT;

/** The Dvar Torah feature is offered only when there is something legitimate to show. */
export const DVAR_TORAH_AVAILABLE: boolean = CONTENT.some((c) => c.kind === 'dvar-torah');

export const contentRef = (c: ContentItem) => `${c.id}@${c.version}`;

/**
 * Which approved item belongs to which date (round 11 §4): an explicit schedule in the pack,
 * `schedule: { "YYYY-MM-DD": "dvar-torah/<id>" }`. Adding items or dates never changes a date
 * that already has its item (the old rotation "day modulo count" did).
 */
export const SCHEDULE: Readonly<Record<string, string>> = Object.freeze(
  ((dvarTorahPack as { schedule?: Record<string, string> }).schedule ?? {}) as Record<string, string>,
);

/** How many days an item stays shown after its date when the next date has none. */
export const CARRY_DAYS = 7;

/**
 * The Dvar Torah for a date:
 *  1. the approved item scheduled for that date;
 *  2. otherwise the latest scheduled approved item in the previous CARRY_DAYS days;
 *  3. otherwise nothing ("no Dvar Torah today") – never an unapproved item.
 * Development / demo builds without any schedule show the TEST_ONLY placeholder (never in production:
 * CONTENT has no TEST_ONLY item there, and the release check fails otherwise).
 */
export function dvarTorahFor(
  dateKey: string,
  items: ContentItem[] = CONTENT,
  schedule: Readonly<Record<string, string>> = SCHEDULE,
): ContentItem | null {
  const approved = new Map(items.filter((c) => c.kind === 'dvar-torah' && c.approval === 'APPROVED').map((c) => [c.id, c]));
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  for (let back = 0; back <= CARRY_DAYS; back += 1) {
    const key = new Date(Date.UTC(y, m - 1, d - back)).toISOString().slice(0, 10);
    const id = schedule[key];
    if (id !== undefined) return approved.get(id) ?? null;
  }
  if (Object.keys(schedule).length === 0 && approved.size === 0) {
    // Only reachable in dev/demo: production CONTENT holds approved items only.
    return items.find((c) => c.kind === 'dvar-torah' && c.approval !== 'APPROVED') ?? null;
  }
  return null;
}

/** Problems in a schedule: bad dates, unknown or unapproved ids. */
export function scheduleProblems(schedule: Record<string, string>, items: ContentItem[]): string[] {
  const approved = new Set(items.filter((c) => c.approval === 'APPROVED').map((c) => c.id));
  const out: string[] = [];
  for (const [date, id] of Object.entries(schedule)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) out.push(`bad date ${date}`);
    if (!approved.has(id)) out.push(`${date}: ${id} is not an approved item`);
  }
  return out;
}
