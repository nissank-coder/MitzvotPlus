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
