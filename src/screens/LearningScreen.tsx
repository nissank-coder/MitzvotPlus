import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Button, CheckMark, Num, Ring, ScreenHeader, SectionTitle, Surface } from '../components/ds';
import { ModalLayer } from '../components/Modal';
import { FontSizeControl } from '../components/TextReader';
import { Chip, ExternalLink } from '../components/ui';
import { DEFAULT_TRACKS } from '../data/tracks';
import { currentStreak } from '../lib/progress';
import { deviceTextCache, FAILURE_TEXT, loadSefariaText, SefariaError, TrackItem, trackItem, TRACKS } from '../lib/learning';
import type { SefariaText } from '../lib/sefaria';
import { formatTime } from '../lib/dates';
import { useAppStore } from '../store/AppStore';
import { ds } from '../theme';

type Props = { onBack: () => void; onOpenProfile: () => void; onOpenTehillim: () => void };

/** Learning entries of a day (the "לימוד יומי" habit counts every one of them). */
const LEARNING = new Set(['torahStudy', 'learningTrack', 'mitzvahStudy', 'dailyTorah', 'tehillim']);

/**
 * "לימוד יומי" (rounds 13–14). One figure (did I learn today), one action (record a learning that
 * was done, also outside the app), then the tracks: today's portion, "קריאה" (opens the text –
 * opening records nothing) and "למדתי" (records it). Nothing is chosen for the user: a new user
 * sees three suggestions; tracks saved before round 14 that are exactly the old defaults are shown
 * as suggested until kept or changed.
 */
export function LearningScreen({ onBack, onOpenTehillim }: Props) {
  const { state, derived, calendar, addAction, toggleTrack, keepTracks, isRestDay } = useAppStore();
  const [reading, setReading] = useState<TrackItem | null>(null);
  const [editing, setEditing] = useState(false);
  const il = calendar.city.il;

  const items = TRACKS.filter((t) => state.learningTracks.includes(t.key))
    .map((t) => trackItem(t, derived.todayKey, il))
    .filter((i): i is TrackItem => i !== null);
  const suggestions = TRACKS.filter((t) => DEFAULT_TRACKS.includes(t.key) && !state.learningTracks.includes(t.key));
  const suggestedNotChosen = state.learningTracksChosen === false && state.learningTracks.length > 0;

  const doneRefs = new Set(state.logs.filter((l) => l.actionKey === 'learningTrack').map((l) => l.refId));
  // Same streak rule as everywhere else (rest days bridged), per track.
  const streak = (trackKey: string) => {
    const days = new Set<string>();
    for (const ref of doneRefs) if (ref?.startsWith(`${trackKey}:`)) days.add(ref.slice(trackKey.length + 1));
    return currentStreak(days, derived.todayKey, isRestDay);
  };
  const learnedEntries = derived.todayLogs.filter((l) => l.actionKey && LEARNING.has(l.actionKey)).length;
  const tracksDone = items.filter((i) => doneRefs.has(i.refId)).length;
  const learned = derived.learnedToday;
  const recordTrack = (item: TrackItem) => addAction('learningTrack', { refId: item.refId, title: `${item.track.title}: ${item.label}` });

  return (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-4">
      <ScreenHeader title="לימוד יומי" subtitle="כל לימוד נחשב: משנה, דף, ספר או שיעור" onBack={onBack} />

      {/* Today: one figure, one action */}
      <Surface tone="brand" as="section" aria-label="הלימוד שלי היום" className="p-5 flex flex-col gap-4 rounded-[var(--radius-hero)]">
        <div className="flex flex-row items-center gap-4">
          <Ring value={learned ? 1 : 0} max={1} size={88} stroke={9} onBrand>
            {learned ? <AppIcon name="check" size={30} color={ds.lime} strokeWidth={3} /> : <AppIcon name="book" size={28} color={ds.white} />}
          </Ring>
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <span className="text-[12px] font-bold text-on-brand-muted">הלימוד שלי היום</span>
            <span className="text-[19px] font-extrabold leading-snug">{learned ? 'למדת היום. יישר כוח' : 'עוד לא נרשם לימוד היום'}</span>
            <span className="text-[13px] text-on-brand-muted">
              {learnedEntries > 0 ? (
                <>
                  <Num>{learnedEntries}</Num> רישומי לימוד היום
                </>
              ) : (
                'למדת מחוץ לאפליקציה? אפשר לרשום גם את זה'
              )}
            </span>
          </div>
        </div>
        <Button variant="lime" size="lg" icon="plus" className="w-full" onClick={() => addAction('torahStudy')} aria-label="למדתי עכשיו – רישום לימוד תורה">
          למדתי עכשיו
        </Button>
      </Surface>

      {/* Fixed tracks: today's portion, reading, recording */}
      <Surface as="section" aria-label="המסלולים שלי" className="px-4 pt-3 pb-2 flex flex-col shadow-none">
        <SectionTitle title={items.length > 0 ? `המסלולים שלי · ${tracksDone}/${items.length} היום` : 'המסלולים שלי'} action={editing ? 'סיום' : 'עריכה'} onAction={() => setEditing((v) => !v)} />
        {suggestedNotChosen ? (
          <div className="mb-2 rounded-[16px] bg-amber-soft px-3 py-2.5 flex flex-col gap-2" role="note">
            <span className="text-[13px] font-bold text-amber-ink">המסלולים האלה נוספו כהצעה בגרסה קודמת, ולא נבחרו על ידך.</span>
            <div className="flex flex-row gap-2">
              <Button variant="secondary" size="sm" onClick={keepTracks}>
                להשאיר אותם
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                לבחור אחרים
              </Button>
            </div>
          </div>
        ) : null}
        {editing ? (
          <div className="flex flex-row flex-wrap gap-2 pb-3">
            {TRACKS.map((t) => (
              <Chip key={t.key} active={state.learningTracks.includes(t.key)} onPress={() => toggleTrack(t.key)}>
                {t.title}
              </Chip>
            ))}
          </div>
        ) : null}
        {items.length === 0 ? (
          <div className="py-2 flex flex-col gap-2">
            <p className="text-[14px] text-ink-muted">מסלול קבוע עוזר להתמיד. אלה הצעות – שום מסלול לא נבחר בשבילך:</p>
            {suggestions.map((t) => (
              <div key={t.key} className="flex flex-row items-center gap-3 min-h-[56px] border-t border-line first:border-t-0">
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[15px] font-bold text-ink">{t.title}</span>
                  <span className="text-[13px] text-ink-muted">{t.description}</span>
                </span>
                <Button variant="secondary" size="sm" icon="plus" onClick={() => toggleTrack(t.key)} aria-label={`הוספת מסלול: ${t.title}`}>
                  הוספה
                </Button>
              </div>
            ))}
            {!editing ? (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setEditing(true)}>
                כל המסלולים
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => {
              const done = doneRefs.has(item.refId);
              const s = streak(item.track.key);
              return (
                <li key={item.refId} className="flex flex-col gap-2 py-3 border-t border-line first:border-t-0">
                  <div className="flex flex-row items-center gap-3">
                    <CheckMark done={done} size={30} />
                    <span className="flex-1 min-w-0 flex flex-col">
                      <span className="text-[15px] font-bold text-ink">{item.track.title}</span>
                      <span className="text-[13px] text-ink-muted">
                        {item.label}
                        {s > 0 ? ` · ${s} ימים ברצף` : ''}
                      </span>
                    </span>
                  </div>
                  <div className="flex flex-row gap-2 pr-[42px]">
                    {item.url ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="book"
                        onClick={() => (item.track.key === 'psalms' ? onOpenTehillim() : setReading(item))}
                        aria-label={`קריאה: ${item.track.title}`}
                      >
                        קריאה
                      </Button>
                    ) : null}
                    {done ? (
                      <span className="min-h-[44px] flex items-center text-[13px] font-bold text-lime-ink">נרשם היום ✓</span>
                    ) : (
                      <Button variant="ghost" size="sm" icon="check" onClick={() => recordTrack(item)} aria-label={`למדתי: ${item.track.title}`}>
                        למדתי
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      {reading ? <Reader item={reading} done={doneRefs.has(reading.refId)} onRecord={() => recordTrack(reading)} onClose={() => setReading(null)} /> : null}
      <p className="text-[12px] text-ink-muted px-1">
        לוחות הלימוד מחושבים במכשיר. הטקסטים נטענים מספריא (Sefaria) כשיש חיבור. טקסט שנקרא ושרישיונו מתיר, נשמר במכשיר לקריאה בלי רשת. פתיחת טקסט אינה רושמת לימוד.
      </p>
    </div>
  );
}

/** Segments shown at first, and added per tap (round 14: the whole text, never cut). */
const PAGE = 60;

type ReaderState =
  | { kind: 'loading'; attempt: number }
  | { kind: 'ready'; text: SefariaText }
  | { kind: 'failed'; error: SefariaError | Error; at: number };

/** The reader (round 14): size, source / edition / licence, a clear close, loading, a reason on failure. */
function Reader({ item, done, onRecord, onClose }: { item: TrackItem; done: boolean; onRecord: () => void; onClose: () => void }) {
  const { state } = useAppStore();
  const size = state.settings.readerFontSize ?? 21;
  const [st, setSt] = useState<ReaderState>({ kind: 'loading', attempt: 1 });
  const [shown, setShown] = useState(PAGE);
  const [run, setRun] = useState(0);
  const cache = useMemo(() => deviceTextCache(), []);
  const load = useCallback((refresh: boolean) => {
    setSt({ kind: 'loading', attempt: 1 });
    setRun((n) => n + 1);
    return refresh;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let attempt = 1;
    loadSefariaText(item.refs, {
      signal: controller.signal,
      cache,
      refresh: run > 0,
      sleep: (ms) =>
        new Promise((r) => {
          attempt += 1;
          setSt({ kind: 'loading', attempt });
          setTimeout(r, ms);
        }),
    }).then(
      (text) => !controller.signal.aborted && setSt({ kind: 'ready', text }),
      (e: unknown) => !controller.signal.aborted && setSt({ kind: 'failed', error: e instanceof Error ? e : new Error(String(e)), at: Date.now() }),
    );
    return () => controller.abort();
  }, [item.refs, cache, run]);

  return (
    <ModalLayer
      label={`${item.track.title}: ${item.label}`}
      onClose={onClose}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-[#0E1630]/45"
      panelClassName="w-full max-w-[460px] max-h-[90dvh] flex flex-col bg-surface rounded-t-[28px] sheet-safe"
    >
      <div className="px-5 pt-2">
        <div aria-hidden="true" className="w-12 h-[5px] rounded-full bg-line mx-auto mb-3" />
        <div className="flex flex-row items-start gap-3 mb-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-extrabold text-ink">{item.track.title}</h2>
            <p className="text-[13px] font-bold text-brand">{item.label}</p>
          </div>
          <FontSizeControl />
          <button type="button" onClick={onClose} aria-label="סגירה" className="w-11 h-11 rounded-full bg-canvas flex items-center justify-center shrink-0">
            <AppIcon name="close" size={18} color={ds.inkMuted} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-3" aria-live="polite">
        {st.kind === 'loading' ? (
          <p className="text-ink-muted text-[14px] py-6" role="status">
            טוען את הטקסט מספריא…{st.attempt > 1 ? ` (ניסיון ${st.attempt})` : ''}
          </p>
        ) : st.kind === 'failed' ? (
          <FailureView error={st.error} onRetry={() => load(true)} url={item.url} />
        ) : (
          <div dir="rtl" lang="he" className="flex flex-col gap-3 pt-1">
            {st.text.segments.slice(0, shown).map((p, i) => (
              <p key={i} className="reader-text text-ink" style={{ fontSize: size, lineHeight: 1.75 }}>
                {p}
              </p>
            ))}
            {st.text.segments.length > shown ? (
              <Button variant="secondary" size="sm" className="self-center" onClick={() => setShown((n) => n + PAGE)}>
                המשך הקריאה ({st.text.segments.length - shown} קטעים נוספים)
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <div className="px-5 pt-2 pb-1 border-t border-line flex flex-col gap-2">
        {st.kind === 'ready' ? (
          <p className="text-[11px] leading-5 text-ink-muted">
            מקור: ספריא{st.text.version ? ` · מהדורה: ${st.text.version}` : ''}
            {st.text.license ? ` · רישיון: ${st.text.license}` : ''}
            {st.text.fromCache ? ` · נשמר במכשיר (${new Date(st.text.fetchedAt).toLocaleDateString('he-IL')} ${formatTime(st.text.fetchedAt)})` : ''}
          </p>
        ) : null}
        <div className="flex flex-row items-center gap-2">
          {done ? (
            <span className="flex-1 min-h-[48px] flex items-center text-[14px] font-bold text-lime-ink">הלימוד הזה נרשם היום ✓</span>
          ) : (
            <Button variant="primary" icon="check" className="flex-1" onClick={onRecord} aria-label={`למדתי – רישום: ${item.track.title}`}>
              למדתי – לרשום
            </Button>
          )}
          {item.url ? <ExternalLink href={item.url}>בספריא</ExternalLink> : null}
        </div>
      </div>
    </ModalLayer>
  );
}

function FailureView({ error, onRetry, url }: { error: Error; onRetry: () => void; url: string | null }) {
  const known = error instanceof SefariaError;
  const kind = known ? error.kind : null;
  return (
    <div className="flex flex-col gap-3 py-4" role="alert">
      <p className="text-[15px] font-bold text-ink">{kind ? FAILURE_TEXT[kind] : 'לא ניתן לטעון את הטקסט כרגע.'}</p>
      <div className="flex flex-row flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon="reset" onClick={onRetry}>
          לנסות שוב
        </Button>
        {url ? <ExternalLink href={url}>פתיחה בספריא</ExternalLink> : null}
      </div>
      {/* The technical reason, so a failure on a phone can be diagnosed from the screen (no personal data). */}
      <details className="text-[12px] text-ink-muted">
        <summary className="min-h-[44px] flex items-center cursor-pointer">פרטים טכניים</summary>
        <p dir="ltr" className="text-left font-mono break-all">
          {known
            ? `${error.kind} · ${error.ref} · HTTP ${error.detail.status ?? '—'} · ${error.detail.ms} ms · attempts ${error.detail.attempts}${error.detail.message ? ` · ${error.detail.message}` : ''}`
            : error.message}
        </p>
      </details>
    </div>
  );
}
