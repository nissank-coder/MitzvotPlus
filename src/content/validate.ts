import { ALLOWED_LICENSES } from './packs';
import type { ContentItem } from './registry';

/**
 * Rules an item must meet before the app may show it as real content (D08).
 * Fail closed: anything that does not pass is not shown in a production build.
 * The reviewer is whoever the owner names in D08 – this code does not decide that.
 */
export function contentProblems(item: ContentItem): string[] {
  const p: string[] = [];
  if (!/^dvar-torah\/[a-z0-9-]+$/.test(item.id)) p.push('id must look like dvar-torah/<slug>');
  if (!item.version.trim()) p.push('version missing');
  if (!item.title.trim()) p.push('title missing');
  if (item.body.trim().length < 20) p.push('body missing or too short');
  if (item.approval !== 'APPROVED') p.push('approval is not APPROVED');
  if (!item.source || !item.source.title.trim()) p.push('exact source missing');
  if (!ALLOWED_LICENSES.includes(item.license.id)) p.push(`license ${item.license.id} not in allowlist`);
  if (item.license.id.startsWith('CC-BY') && !item.license.attribution?.trim()) p.push('CC-BY needs attribution');
  if (!item.review?.reviewer.trim()) p.push('reviewer missing');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.review?.reviewedAt ?? '')) p.push('review date missing (YYYY-MM-DD)');
  return p;
}

export function partitionContent(items: ContentItem[]): { valid: ContentItem[]; rejected: { id: string; problems: string[] }[] } {
  const valid: ContentItem[] = [];
  const rejected: { id: string; problems: string[] }[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const problems = contentProblems(item);
    if (seen.has(item.id)) problems.push('duplicate id');
    seen.add(item.id);
    if (problems.length) rejected.push({ id: item.id, problems });
    else valid.push(item);
  }
  return { valid, rejected };
}
