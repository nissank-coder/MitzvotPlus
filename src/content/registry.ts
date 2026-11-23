import { TORAH_TEXT } from '../data';

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
};

export const CONTENT: ContentItem[] = [
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

export const contentRef = (c: ContentItem) => `${c.id}@${c.version}`;

/**
 * The Dvar Torah for a date: rotates through approved items; falls back to test items only
 * when nothing is approved yet. Deterministic, so the same day shows the same text offline.
 */
export function dvarTorahFor(dateKey: string, items: ContentItem[] = CONTENT): ContentItem | null {
  const all = items.filter((c) => c.kind === 'dvar-torah');
  const approved = all.filter((c) => c.approval === 'APPROVED');
  const pool = approved.length > 0 ? approved : all;
  if (pool.length === 0) return null;
  const [y = 2026, m = 1, d = 1] = dateKey.split('-').map(Number);
  const day = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return pool[day % pool.length] ?? null;
}
