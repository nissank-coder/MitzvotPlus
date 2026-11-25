import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pack from '../content/packs/dvar-torah.json';
import { REJECTED_CONTENT, type ContentItem } from '../content/registry';
import { contentProblems, partitionContent } from '../content/validate';

const good: ContentItem = {
  id: 'dvar-torah/example',
  version: '1',
  kind: 'dvar-torah',
  language: 'he',
  title: 'כותרת',
  body: 'גוף הטקסט של דבר התורה, ארוך מספיק לבדיקה.',
  source: { title: 'מקור לדוגמה', ref: 'עמ׳ 1' },
  license: { id: 'Public Domain' },
  approval: 'APPROVED',
  review: { reviewer: 'reviewer-placeholder', reviewedAt: '2026-11-24' },
};

/** Minimal CSV parser (quoted fields, commas inside quotes). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head = [], ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

describe('dvar torah approval rules', () => {
  it('accepts a complete approved item', () => {
    expect(contentProblems(good)).toEqual([]);
  });

  it.each([
    ['no source', { source: null }],
    ['license outside allowlist', { license: { id: 'All rights reserved' } }],
    ['CC-BY without attribution', { license: { id: 'CC-BY' } }],
    ['not approved', { approval: 'TEST_ONLY' as const }],
    ['no reviewer', { review: undefined }],
    ['bad date', { review: { reviewer: 'x', reviewedAt: 'yesterday' } }],
    ['empty body', { body: '' }],
  ])('rejects %s', (_name, patch) => {
    expect(contentProblems({ ...good, ...patch } as ContentItem).length).toBeGreaterThan(0);
  });

  it('drops invalid and duplicate items (fail closed)', () => {
    const { valid, rejected } = partitionContent([good, { ...good }, { ...good, id: 'dvar-torah/b', source: null }]);
    expect(valid).toHaveLength(1);
    expect(rejected.map((r) => r.id)).toEqual(['dvar-torah/example', 'dvar-torah/b']);
  });
});

describe('bundled dvar torah pack', () => {
  const items = pack.items as ContentItem[];
  const manifest = parseCsv(readFileSync('docs/mobile-readiness/content_license_manifest.csv', 'utf8'));

  it('has no rejected items', () => {
    expect(REJECTED_CONTENT).toEqual([]);
  });

  it('every item has an approved manifest row with matching hash', () => {
    for (const item of items) {
      const row = manifest.find((r) => r.content_id === item.id);
      expect(row, `${item.id}: manifest row`).toBeDefined();
      expect(row!.approval_status, item.id).toBe('APPROVED');
      expect(row!.offline_distribution_allowed, item.id).toBe('YES');
      expect(row!.license_identifier, item.id).toBe(item.license.id);
      expect(row!.exact_version, item.id).toBe(item.version);
      expect((row!.editorial_reviewer ?? '').trim(), item.id).not.toBe('');
      const sha = createHash('sha256').update(item.body, 'utf8').digest('hex');
      expect(row!.content_sha256, `${item.id}: body changed after approval`).toBe(sha);
    }
  });

  it('manifest parser reads the existing rows', () => {
    expect(manifest.find((r) => r.content_id === 'dvar-torah/test-placeholder-1')?.approval_status).toBe('TEST_ONLY');
  });
});

describe('bundled schedule (round 11)', async () => {
  const { DAILY_SCHEDULE, WEEKLY_SCHEDULE, scheduleProblems, CONTENT } = await import('../content/registry');
  it('every scheduled date (daily and weekly) points at an approved bundled item', () => {
    expect(scheduleProblems({ ...DAILY_SCHEDULE }, CONTENT)).toEqual([]);
    expect(scheduleProblems({ ...WEEKLY_SCHEDULE }, CONTENT)).toEqual([]);
  });
});
