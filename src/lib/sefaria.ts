/**
 * Loading the texts of the daily learning from Sefaria (round 14, review v4 §4).
 *
 * Diagnosis of "the daily learning does not load" (docs/review-r14/evidence/learning-fetch.json):
 *  - the reference of the screenshot (Kitzur Shulchan Arukh 10) loads: HTTP 200, CORS open, 26
 *    Hebrew segments, Torat Emet, Public Domain – also in Chromium with the production CSP;
 *  - Sefaria answers HTTP 429 ("too many requests") with a body that is not JSON once requests
 *    come close together; the app showed the same "could not load" for it as for anything else,
 *    with no retry, no timeout and no reason;
 *  - the old loader kept only the first 80 segments, silently;
 *  - the Chofetz Chaim and Daf Yomi links covered only the start of the day's portion.
 * What the device itself returned is not known (no device in this environment): the reader now
 * shows the technical reason of a failure, so the next one is diagnosed from the screen.
 *
 * Now: a time limit per attempt, a bounded retry with backoff for what can pass (network,
 * timeout, 429, 5xx, a broken body), a message per kind, the whole text, and a local copy of what
 * was read – only for texts whose licence allows it – for reading without a network.
 */
export type FailureKind = 'offline' | 'timeout' | 'rate-limited' | 'server' | 'not-found' | 'bad-response' | 'api-error' | 'empty';

export class SefariaError extends Error {
  constructor(
    public readonly kind: FailureKind,
    public readonly ref: string,
    public readonly detail: { status?: number; ms: number; attempts: number; message?: string },
  ) {
    super(`${kind} ${ref}`);
  }
}

export type SefariaText = {
  /** The references that were loaded (one, or two for a portion across two sections). */
  refs: string[];
  heRef?: string;
  segments: string[];
  version?: string;
  license?: string;
  sourceUrl?: string;
  fetchedAt: number;
  /** Read from the local copy (no request was made). */
  fromCache?: boolean;
};

/** The reference of a sefaria.org link: its path. */
export function sefariaRef(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
}

export function apiUrlFor(ref: string): string {
  return `https://www.sefaria.org/api/texts/${encodeURIComponent(ref)}?context=0&commentary=0&pad=0`;
}

/** Licences under which a copy may be kept on the device. Anything else is shown, never stored. */
export const CACHEABLE_LICENSES = ['Public Domain', 'CC0', 'CC-BY', 'CC-BY-SA'];
export const cacheable = (license: string | undefined) => Boolean(license && CACHEABLE_LICENSES.includes(license));

export const FAILURE_TEXT: Record<FailureKind, string> = {
  offline: 'אין חיבור לאינטרנט, והטקסט של היום עוד לא נשמר במכשיר.',
  timeout: 'ספריא לא ענתה בזמן. אפשר לנסות שוב.',
  'rate-limited': 'ספריא עמוסה כרגע וביקשה להמתין (429). אפשר לנסות שוב בעוד דקה.',
  server: 'שגיאה בשרת של ספריא. אפשר לנסות שוב מאוחר יותר.',
  'not-found': 'המקור לא נמצא בספריא. אפשר לפתוח אותו באתר.',
  'bad-response': 'התקבלה תשובה לא תקינה מספריא. אפשר לנסות שוב.',
  'api-error': 'ספריא לא הצליחה להציג את המקור הזה. אפשר לפתוח אותו באתר.',
  empty: 'לא נמצא טקסט עברי למקור הזה בספריא.',
};

const RETRYABLE: FailureKind[] = ['offline', 'timeout', 'rate-limited', 'server', 'bad-response'];

function flatten(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    const clean = value
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&thinsp;/g, ' ')
      .trim();
    if (clean) out.push(clean);
  } else if (Array.isArray(value)) {
    for (const v of value) flatten(v, out);
  }
}

export type TextCache = {
  get: (key: string) => Promise<SefariaText | null>;
  put: (key: string, text: SefariaText) => Promise<void>;
};

export type LoadOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Further attempts after the first (only for failures that can pass). */
  retries?: number;
  /** Ignore the local copy (the reader's "load again"). */
  refresh?: boolean;
  cache?: TextCache | null;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  online?: () => boolean;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const BACKOFF_MS = [1500, 4000];

/** One reference, one request (with its time limit). */
async function fetchOnce(ref: string, o: Required<Pick<LoadOptions, 'timeoutMs' | 'fetchImpl' | 'now' | 'online'>> & { signal?: AbortSignal }, attempt: number) {
  const started = o.now();
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  o.signal?.addEventListener('abort', onAbort);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, o.timeoutMs);
  try {
    let res: Response;
    try {
      res = await o.fetchImpl(apiUrlFor(ref), { signal: controller.signal });
    } catch (e) {
      if (o.signal?.aborted) throw e; // the reader was closed: not a failure
      const kind: FailureKind = timedOut ? 'timeout' : 'offline';
      throw new SefariaError(kind, ref, { ms: o.now() - started, attempts: attempt, message: e instanceof Error ? e.message : String(e) });
    }
    const ms = () => o.now() - started;
    if (res.status === 429) throw new SefariaError('rate-limited', ref, { status: 429, ms: ms(), attempts: attempt });
    if (res.status === 404) throw new SefariaError('not-found', ref, { status: 404, ms: ms(), attempts: attempt });
    if (res.status >= 500) throw new SefariaError('server', ref, { status: res.status, ms: ms(), attempts: attempt });
    let data: { he?: unknown; error?: string; heRef?: string; heVersionTitle?: string; heLicense?: string; heVersionSource?: string };
    try {
      data = (await res.json()) as typeof data;
    } catch (e) {
      throw new SefariaError('bad-response', ref, { status: res.status, ms: ms(), attempts: attempt, message: e instanceof Error ? e.message : String(e) });
    }
    if (!res.ok) throw new SefariaError('server', ref, { status: res.status, ms: ms(), attempts: attempt });
    if (data.error) throw new SefariaError('api-error', ref, { status: res.status, ms: ms(), attempts: attempt, message: String(data.error).slice(0, 160) });
    const segments: string[] = [];
    flatten(data.he, segments);
    if (segments.length === 0) throw new SefariaError('empty', ref, { status: res.status, ms: ms(), attempts: attempt });
    return { segments, heRef: data.heRef, version: data.heVersionTitle, license: data.heLicense, sourceUrl: data.heVersionSource };
  } finally {
    clearTimeout(timer);
    o.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * The whole text of the references, in order (a portion across two sections is two references,
 * fetched one after the other). The local copy is used first, when there is one.
 */
export async function loadSefariaText(refs: string[], options: LoadOptions = {}): Promise<SefariaText> {
  const o = {
    timeoutMs: options.timeoutMs ?? 12_000,
    retries: options.retries ?? 2,
    fetchImpl: options.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a)),
    sleep: options.sleep ?? defaultSleep,
    now: options.now ?? Date.now,
    online: options.online ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)),
    signal: options.signal,
  };
  const key = refs.join('|');
  if (!options.refresh && options.cache) {
    const hit = await options.cache.get(key).catch(() => null);
    if (hit) return { ...hit, fromCache: true };
  }
  const parts: Array<Awaited<ReturnType<typeof fetchOnce>>> = [];
  for (const ref of refs) {
    for (let attempt = 1; ; attempt += 1) {
      try {
        parts.push(await fetchOnce(ref, o, attempt));
        break;
      } catch (e) {
        if (!(e instanceof SefariaError)) throw e;
        const last = attempt > o.retries || !RETRYABLE.includes(e.kind) || (e.kind === 'offline' && !o.online());
        if (last) throw e;
        await o.sleep(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]! * (e.kind === 'rate-limited' ? 2 : 1));
        if (o.signal?.aborted) throw e;
      }
    }
  }
  const text: SefariaText = {
    refs,
    heRef: parts.map((p) => p.heRef).filter(Boolean).join(' · ') || undefined,
    segments: parts.flatMap((p) => p.segments),
    version: parts[0]?.version,
    license: parts.every((p) => p.license === parts[0]?.license) ? parts[0]?.license : undefined,
    sourceUrl: parts[0]?.sourceUrl,
    fetchedAt: o.now(),
  };
  if (options.cache && cacheable(text.license)) await options.cache.put(key, text).catch(() => undefined);
  return text;
}

/* ------------------------------ the device's copy ------------------------------ */

const CACHE_NAME = 'mitzvot-sefaria-v1';
const INDEX_KEY = 'mitzvot_sefaria_index_v1';
const MAX_ENTRIES = 60;

/**
 * Texts read on this device, kept in the browser's Cache Storage (the app's own origin, cleared
 * with the app's data). Public texts only (see cacheable). At most MAX_ENTRIES; the oldest go first.
 */
export function deviceTextCache(): TextCache | null {
  if (typeof caches === 'undefined' || typeof localStorage === 'undefined') return null;
  const index = (): string[] => {
    try {
      return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  };
  const url = (key: string) => `https://cache.local/sefaria/${encodeURIComponent(key)}`;
  return {
    async get(key) {
      const c = await caches.open(CACHE_NAME);
      const r = await c.match(url(key));
      return r ? ((await r.json()) as SefariaText) : null;
    },
    async put(key, text) {
      const c = await caches.open(CACHE_NAME);
      await c.put(url(key), new Response(JSON.stringify({ ...text, fromCache: undefined }), { headers: { 'content-type': 'application/json' } }));
      const keys = [key, ...index().filter((k) => k !== key)];
      for (const old of keys.slice(MAX_ENTRIES)) await c.delete(url(old));
      try {
        localStorage.setItem(INDEX_KEY, JSON.stringify(keys.slice(0, MAX_ENTRIES)));
      } catch {
        // the index is a convenience; the copies stay readable without it
      }
    },
  };
}
