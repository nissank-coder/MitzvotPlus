import React, { useEffect, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Button, CheckMark, Num, Ring, ScreenHeader, SectionTitle, Surface } from '../components/ds';
import { ModalLayer } from '../components/Modal';
import { Chip, ExternalLink } from '../components/ui';
import { currentStreak } from '../lib/progress';
import { fetchSefariaText, TrackItem, trackItem, TRACKS } from '../lib/learning';
import { useAppStore } from '../store/AppStore';
import { ds } from '../theme';

type Props = { onBack: () => void; onOpenProfile: () => void; onOpenTehillim: () => void };

/** Learning entries of a day (the "לימוד יומי" habit counts every one of them). */
const LEARNING = new Set(['torahStudy', 'learningTrack', 'mitzvahStudy', 'dailyTorah', 'tehillim']);

/**
 * "לימוד יומי" (round 13, review §5): where a production user lands from Home while no approved
 * Dvar Torah content exists. Same language as the redesigned screens (active+): one leading figure
 * (did I learn today), one primary action (record a learning that was done), then the fixed tracks
 * with today's portion, reading and recording. Nothing new is scored: "למדתי עכשיו" is the existing
 * "לימוד תורה" entry, a track portion is the existing "מסלול לימוד" entry.
 */
export function LearningScreen({ onBack, onOpenTehillim }: Props) {
  const { state, derived, calendar, addAction, toggleTrack, isRestDay } = useAppStore();
  const [reading, setReading] = useState<TrackItem | null>(null);
  const [editing, setEditing] = useState(false);
  const il = calendar.city.il;

  const items = TRACKS.filter((t) => state.learningTracks.includes(t.key))
    .map((t) => trackItem(t, derived.todayKey, il))
    .filter((i): i is TrackItem => i !== null);

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
                'רושמים לימוד שכבר נעשה'
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
          <div className="py-3 flex flex-col gap-3">
            <p className="text-[14px] text-ink-muted">מסלול קבוע עוזר להתמיד: משנה יומית, דף יומי, פרק תהילים ועוד.</p>
            {!editing ? (
              <Button variant="secondary" size="sm" className="self-start" onClick={() => setEditing(true)}>
                בחירת מסלול
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col">
            {items.map((item) => {
              const done = doneRefs.has(item.refId);
              const s = streak(item.track.key);
              return (
                <li key={item.refId} className="flex flex-row items-center gap-3 min-h-[64px] border-t border-line first:border-t-0">
                  <CheckMark done={done} size={30} />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[15px] font-bold text-ink">{item.track.title}</span>
                    <span className="text-[13px] text-ink-muted truncate">
                      {item.label}
                      {s > 0 ? ` · ${s} ימים ברצף` : ''}
                    </span>
                  </span>
                  {item.url ? (
                    <button
                      type="button"
                      onClick={() => (item.track.key === 'psalms' ? onOpenTehillim() : setReading(item))}
                      aria-label={`קריאה: ${item.track.title}`}
                      className="w-11 h-11 rounded-full bg-brand-soft flex items-center justify-center shrink-0 active:bg-brand-line"
                    >
                      <AppIcon name="book" size={18} color={ds.brand} />
                    </button>
                  ) : null}
                  {done ? (
                    <span className="text-[13px] font-bold text-lime-ink shrink-0">נרשם ✓</span>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => addAction('learningTrack', { refId: item.refId, title: `${item.track.title}: ${item.label}` })}
                      aria-label={`למדתי: ${item.track.title}`}
                    >
                      למדתי
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Surface>

      {reading ? <Reader item={reading} onClose={() => setReading(null)} /> : null}
      <p className="text-[12px] text-ink-muted px-1">לוחות הלימוד מחושבים במכשיר. הטקסטים נטענים מספריא (Sefaria) כשיש חיבור לאינטרנט.</p>
    </div>
  );
}

function Reader({ item, onClose }: { item: TrackItem; onClose: () => void }) {
  const [text, setText] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!item.url) return;
    const controller = new AbortController();
    setText(null);
    setFailed(false);
    fetchSefariaText(item.url, controller.signal)
      .then(setText)
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== 'AbortError') setFailed(true);
      });
    return () => controller.abort();
  }, [item.url]);

  return (
    <ModalLayer
      label={item.track.title}
      onClose={onClose}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-[#0E1630]/45"
      panelClassName="w-full max-w-[460px] max-h-[85dvh] overflow-y-auto bg-surface rounded-t-[28px] px-5 pt-2 sheet-safe"
    >
        <div aria-hidden="true" className="w-12 h-[5px] rounded-full bg-line mx-auto mb-3" />
        <div className="flex flex-row items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-[20px] font-extrabold text-ink">{item.track.title}</h2>
            <p className="text-[13px] font-bold text-brand">{item.label}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="סגירה" className="w-11 h-11 rounded-full bg-canvas flex items-center justify-center shrink-0">
            <AppIcon name="close" size={18} color={ds.inkMuted} />
          </button>
        </div>
        {text ? (
          <div className="flex flex-col gap-3">
            {text.map((p, i) => (
              <p key={i} className="text-ink text-[17px] leading-8">{p}</p>
            ))}
          </div>
        ) : failed ? (
          <p className="text-ink-muted text-[14px]">לא ניתן לטעון את הטקסט כעת.</p>
        ) : (
          <p className="text-ink-muted text-[14px]">טוען…</p>
        )}
        {item.url ? (
          <div className="mt-4">
            <ExternalLink href={item.url}>פתיחה בספריא</ExternalLink>
          </div>
        ) : null}
    </ModalLayer>
  );
}
