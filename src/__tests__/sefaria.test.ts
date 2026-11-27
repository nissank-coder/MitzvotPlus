import { describe, expect, it } from 'vitest';
import { portionRefs, trackItem, TRACKS } from '../lib/learning';
import { apiUrlFor, cacheable, loadSefariaText, SefariaError, SefariaText, TextCache } from '../lib/sefaria';

/**
 * Round 14 (review v4 §4) – the daily learning loads, or says why not. The old loader had no time
 * limit and no retry, treated Sefaria's HTTP 429 (a body that is not JSON) like any failure, and
 * kept only the first 80 segments. docs/review-r14/evidence/learning-fetch.json has the real
 * answers of Sefaria (including a burst answered with 429).
 */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (n: number, extra: Record<string, unknown> = {}) => json({ he: Array.from({ length: n }, (_, i) => `קטע ${i + 1}`), heVersionTitle: 'Torat Emet 357', heLicense: 'Public Domain', ...extra });
const noSleep = async () => undefined;
const script = (...answers: Array<Response | Error | 'hang'>) => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string, init?: { signal?: AbortSignal }) => {
    calls.push(String(url));
    const a = answers.shift();
    if (a === 'hang') return new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    if (a instanceof Error) throw a;
    return a!;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
};
const memoryCache = (): TextCache & { store: Map<string, SefariaText> } => {
  const store = new Map<string, SefariaText>();
  return { store, get: async (k) => store.get(k) ?? null, put: async (k, t) => void store.set(k, t) };
};

describe('loading a text', () => {
  it('the whole text – never cut at 80 segments', async () => {
    const { fetchImpl } = script(ok(173));
    const t = await loadSefariaText(['Psalms.119'], { fetchImpl, sleep: noSleep });
    expect(t.segments).toHaveLength(173);
    expect(t).toMatchObject({ version: 'Torat Emet 357', license: 'Public Domain' });
  });

  it('HTTP 429 (a body that is not JSON) is "rate-limited", retried with a pause, and passes when Sefaria answers', async () => {
    const pauses: number[] = [];
    const { fetchImpl, calls } = script(new Response('<html>Too Many Requests</html>', { status: 429 }), ok(26));
    const t = await loadSefariaText(['Kitzur_Shulchan_Arukh.10'], { fetchImpl, sleep: async (ms) => void pauses.push(ms) });
    expect(t.segments).toHaveLength(26);
    expect(calls).toHaveLength(2);
    expect(pauses[0]).toBeGreaterThanOrEqual(3000);
  });

  it('429 every time: after the retries, a "rate-limited" failure with its status and attempts', async () => {
    const busy = () => new Response('busy', { status: 429 });
    const { fetchImpl } = script(busy(), busy(), busy());
    const e = await loadSefariaText(['Kitzur_Shulchan_Arukh.10'], { fetchImpl, sleep: noSleep }).catch((x) => x);
    expect(e).toBeInstanceOf(SefariaError);
    expect(e).toMatchObject({ kind: 'rate-limited', ref: 'Kitzur_Shulchan_Arukh.10', detail: { status: 429, attempts: 3 } });
  });

  it('no answer in time: "timeout", retried, then reported', async () => {
    const { fetchImpl, calls } = script('hang', 'hang', 'hang');
    const e = await loadSefariaText(['Kitzur_Shulchan_Arukh.10'], { fetchImpl, sleep: noSleep, timeoutMs: 20 }).catch((x) => x);
    expect(e).toMatchObject({ kind: 'timeout' });
    expect(calls).toHaveLength(3);
  });

  it('no network while offline: one attempt, "offline" (nothing to wait for)', async () => {
    const { fetchImpl, calls } = script(new TypeError('Failed to fetch'), ok(1));
    const e = await loadSefariaText(['X.1'], { fetchImpl, sleep: noSleep, online: () => false }).catch((x) => x);
    expect(e).toMatchObject({ kind: 'offline' });
    expect(calls).toHaveLength(1);
  });

  it('a broken body is retried; an answer that names an error, 404 and an empty text are not', async () => {
    expect(await loadSefariaText(['X.1'], { ...script(new Response('{not json', { status: 200 }), ok(3)), sleep: noSleep })).toMatchObject({ segments: ['קטע 1', 'קטע 2', 'קטע 3'] });
    const apiError = script(json({ error: 'X.1 is an invalid range.' }), ok(1));
    expect(await loadSefariaText(['X.1'], { ...apiError, sleep: noSleep }).catch((x) => x)).toMatchObject({ kind: 'api-error' });
    expect(apiError.calls).toHaveLength(1);
    expect(await loadSefariaText(['X.1'], { ...script(new Response('nf', { status: 404 })), sleep: noSleep }).catch((x) => x)).toMatchObject({ kind: 'not-found' });
    expect(await loadSefariaText(['X.1'], { ...script(json({ he: ['', '  '] })), sleep: noSleep }).catch((x) => x)).toMatchObject({ kind: 'empty' });
  });

  it('closing the reader cancels the request – it is not reported as a failure of Sefaria', async () => {
    const controller = new AbortController();
    const { fetchImpl } = script('hang');
    const p = loadSefariaText(['X.1'], { fetchImpl, sleep: noSleep, signal: controller.signal });
    controller.abort();
    expect(await p.catch((x) => x)).not.toBeInstanceOf(SefariaError);
  });

  it('a portion across two sections: both, in order, as one text', async () => {
    const { fetchImpl, calls } = script(json({ he: ['a', 'b'], heLicense: 'CC-BY-SA' }), json({ he: ['c'], heLicense: 'CC-BY-SA' }));
    const t = await loadSefariaText(['A.8.13', 'A.9.1-1'], { fetchImpl, sleep: noSleep });
    expect(t.segments).toEqual(['a', 'b', 'c']);
    expect(calls).toEqual([apiUrlFor('A.8.13'), apiUrlFor('A.9.1-1')]);
  });
});

describe('the device copy (reading without a network)', () => {
  it('a text read once is read again from the device, with its date – no request', async () => {
    const cache = memoryCache();
    await loadSefariaText(['Kitzur_Shulchan_Arukh.10'], { ...script(ok(26)), cache, sleep: noSleep, now: () => 1_000 });
    const { fetchImpl, calls } = script();
    const again = await loadSefariaText(['Kitzur_Shulchan_Arukh.10'], { fetchImpl, cache, sleep: noSleep });
    expect(again).toMatchObject({ fromCache: true, fetchedAt: 1_000, license: 'Public Domain' });
    expect(calls).toHaveLength(0);
  });

  it('only what its licence allows is kept on the device', async () => {
    const cache = memoryCache();
    await loadSefariaText(['Arakhin.9a-9b'], { ...script(ok(22, { heLicense: 'CC-BY-NC' })), cache, sleep: noSleep });
    expect(cache.store.size).toBe(0);
    expect(cacheable('Public Domain') && cacheable('CC-BY-SA') && !cacheable('CC-BY-NC') && !cacheable(undefined)).toBe(true);
  });

  it('"load again" ignores the copy and refreshes it', async () => {
    const cache = memoryCache();
    await loadSefariaText(['K.1'], { ...script(ok(1)), cache, sleep: noSleep });
    const fresh = await loadSefariaText(['K.1'], { ...script(ok(2)), cache, sleep: noSleep, refresh: true });
    expect(fresh.fromCache).toBeUndefined();
    expect(cache.store.get('K.1')?.segments).toHaveLength(2);
  });
});

describe('the whole portion of the day', () => {
  it('Chofetz Chaim: the range of the label, not only its first section', () => {
    const url = 'https://www.sefaria.org/Chofetz_Chaim%2C_Part_One%2C_The_Prohibition_Against_Lashon_Hara%2C_Principle_9.3?lang=he';
    expect(portionRefs('chofetzchaim', url, { reading: { b: 9.3, e: 9.4 } })).toEqual(['Chofetz_Chaim,_Part_One,_The_Prohibition_Against_Lashon_Hara,_Principle_9.3-4']);
    // hebcal keeps "8.10" as a string (8.1 would be another section).
    const u10 = url.replace('9.3', '8.10');
    expect(portionRefs('chofetzchaim', u10, { reading: { b: '8.10', e: 8.11 } })).toEqual(['Chofetz_Chaim,_Part_One,_The_Prohibition_Against_Lashon_Hara,_Principle_8.10-11']);
    expect(portionRefs('chofetzchaim', url, { reading: { b: 9.3 } })).toHaveLength(1);
    expect(portionRefs('chofetzchaim', url.replace('9.3', '8.13'), { reading: { b: 8.13, e: 9.1 } })).toHaveLength(2);
  });

  it('Daf Yomi: both sides of the daf', () => {
    expect(portionRefs('dafyomi', 'https://www.sefaria.org/Arakhin.9a?lang=he', {})).toEqual(['Arakhin.9a-9b']);
  });

  it('every track of a day has its references (the reader loads the whole portion)', () => {
    for (const t of TRACKS) {
      const item = trackItem(t, '2026-11-26', true);
      expect(item?.refs.length).toBeGreaterThan(0);
    }
    expect(trackItem(TRACKS[0]!, '2026-11-26', true)?.refs).toEqual(['Kitzur_Shulchan_Arukh.10']);
  });
});
