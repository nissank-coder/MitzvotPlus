import React, { useEffect, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, IconBadge, Num, PrivacyBadge, ScreenHeader, SectionTitle, Surface } from '../components/ds';
import { useAppStore } from '../store/AppStore';
import { averageMs, bestIncludingCurrent, canUndo, elapsed as timerElapsed } from '../lib/speechTimer';
import { ds } from '../theme';
import { formatTime } from '../lib/dates';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type Props = {
  onBack: () => void;
  onOpenProfile: () => void;
};

/** The largest whole unit first ("3 ימים"), then the rest ("4 שעות · 12 דקות"). */
export function spanParts(ms: number): { value: number; unit: string; rest: string } {
  const safe = Math.max(0, ms);
  const days = Math.floor(safe / DAY_MS);
  const hours = Math.floor((safe % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((safe % HOUR_MS) / MINUTE_MS);
  if (days > 0) return { value: days, unit: days === 1 ? 'יום' : 'ימים', rest: `${hours} שעות · ${minutes} דקות` };
  if (hours > 0) return { value: hours, unit: hours === 1 ? 'שעה' : 'שעות', rest: `${minutes} דקות` };
  return { value: minutes, unit: minutes === 1 ? 'דקה' : 'דקות', rest: 'מתחילים' };
}
const short = (ms: number | null) => {
  if (ms === null) return '—';
  const p = spanParts(ms);
  return ms < MINUTE_MS ? 'פחות מדקה' : `${p.value} ${p.unit}`;
};

/**
 * "שמירת הלשון" – design round 1. The time that passed since the last reset the user recorded:
 * a running count up, not a countdown and not a session. Private and local (never synced, shared or
 * compared). The text speaks of "the time since you last recorded" – never as proof that nothing
 * happened. A reset needs an explicit confirmation, can be undone for 10 minutes, and touches
 * nothing else in the app. The elapsed time is always derived from the stored start instant, so it
 * is right after the app returns from the background.
 */
export function LashonHaraScreen({ onBack }: Props) {
  const { state, startSpeech, resetSpeech, undoSpeechReset } = useAppStore();
  const [now, setNow] = useState(Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    // Back from the background: recompute at once (the interval may have been paused).
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);

  const timer = state.speech;
  const started = timer.since !== null;
  const { ms, clockMovedBack } = timerElapsed(timer, now);
  const current = spanParts(ms);
  const undoable = canUndo(timer, now);
  const avg = averageMs(timer);
  const best = bestIncludingCurrent(timer, now);

  return (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-4">
      <ScreenHeader title="שמירת הלשון" subtitle="מודעות לדיבור, בלי שיפוטיות" onBack={onBack} />
      <PrivacyBadge>פרטי · נשמר רק במכשיר הזה · לא משותף ולא מגובה</PrivacyBadge>

      <Surface tone="brand" as="section" aria-label="המונה" className="p-5 flex flex-col gap-4 rounded-[var(--radius-hero)]">
        {!started ? (
          <>
            <IconBadge name="shield" tone="onBrand" size={48} />
            <div className="flex flex-col gap-2">
              <h2 className="text-[22px] font-extrabold">מתחילים כשמוכנים</h2>
              <p className="text-[15px] leading-6 text-on-brand-muted">
                המונה סופר את הזמן מרגע שתפעיל אותו. אם תרשום מעידה, הוא יתחיל מחדש. הכל נשאר אצלך, במכשיר.
              </p>
            </div>
            <Button
              variant="lime"
              size="lg"
              icon="play"
              onClick={() => {
                startSpeech();
                setNow(Date.now());
              }}
            >
              הפעלת המונה
            </Button>
          </>
        ) : (
          <>
            <span className="text-[14px] font-bold text-on-brand-muted">הזמן מאז האיפוס האחרון שרשמת</span>
            <div className="flex flex-row items-end gap-3" aria-live="off">
              <span className="num text-[72px] font-extrabold leading-[0.9]">{current.value}</span>
              <span className="text-[24px] font-extrabold pb-1">{current.unit}</span>
            </div>
            <span className="text-[17px] font-bold">{current.rest}</span>
            <span className="text-[13px] text-on-brand-muted">
              {timer.resets === 0 ? 'מאז שהפעלת את המונה' : 'מאז הרישום האחרון'}:{' '}
              <Num>
                {now - timer.since! >= DAY_MS ? `${new Date(timer.since!).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} · ` : ''}
                {formatTime(timer.since!)}
              </Num>
            </span>
            {clockMovedBack ? (
              <p role="status" className="text-[13px] font-bold">
                שעון המכשיר מוקדם ממועד ההתחלה. הזמן יוצג שוב כשהשעון יתוקן.
              </p>
            ) : null}
          </>
        )}
      </Surface>

      {started ? (
        <Surface as="section" aria-label="רישום מעידה" className="p-4 flex flex-col gap-3">
          {undoable ? (
            <div className="rounded-[16px] bg-lime-soft p-3 flex flex-row items-center gap-3" role="status">
              <span className="flex-1 text-[14px] font-bold text-ink">המונה התחיל מחדש. אפשר לבטל במשך 10 דקות.</span>
              <Button variant="secondary" size="sm" icon="reset" onClick={undoSpeechReset}>
                ביטול האיפוס
              </Button>
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] font-extrabold text-ink">מעדת? זה חלק מהדרך</h2>
            <p className="text-[14px] text-ink-muted leading-6">רישום מעידה מתחיל את המונה מחדש. השיא והממוצע נשמרים, ושום תחום אחר באפליקציה לא מושפע.</p>
          </div>
          <Button variant="secondary" icon="reset" onClick={() => setConfirmOpen(true)}>
            רישום מעידה ואיפוס
          </Button>
        </Surface>
      ) : null}

      {started ? (
        <Surface as="section" aria-label="סיכום אישי" className="p-4 grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'עכשיו', value: short(ms) },
            { label: 'השיא שלך', value: short(best) },
            { label: 'ממוצע', value: short(avg) },
          ].map((s, i) => (
            <div key={s.label} className={`flex flex-col gap-1 py-1 ${i > 0 ? 'border-r border-line' : ''}`}>
              <span className="text-[12px] font-bold text-ink-muted">{s.label}</span>
              <span className="text-[16px] font-extrabold text-ink">{s.value}</span>
            </div>
          ))}
        </Surface>
      ) : null}

      <Surface as="section" aria-label="רעיונות קטנים" className="px-4 pt-3 pb-1 flex flex-col">
        <SectionTitle title="רעיונות קטנים" />
        {[
          { icon: 'chat' as const, title: 'עוצרים רגע לפני שמדברים', text: 'שואלים: האם זה נכון, נחוץ ומיטיב?' },
          { icon: 'leaf' as const, title: 'מכוונים את השיחה לטוב', text: 'מעבירים את המיקוד לנושא מועיל או למילה טובה.' },
          { icon: 'heart' as const, title: 'מדברים על אחרים כפי שהיינו רוצים', text: 'חושבים איך היינו מרגישים אילו הדברים נאמרו עלינו.' },
        ].map((t) => (
          <div key={t.title} className="flex flex-row items-start gap-3 py-3 border-t border-line first:border-t-0">
            <IconBadge name={t.icon} size={36} />
            <span className="flex-1 flex flex-col">
              <span className="text-[15px] font-bold text-ink">{t.title}</span>
              <span className="text-[14px] text-ink-muted leading-6">{t.text}</span>
            </span>
          </div>
        ))}
      </Surface>
      <p className="text-[12px] text-ink-muted px-1 flex flex-row items-start gap-1.5">
        <AppIcon name="lock" size={14} color={ds.inkMuted} />
        המונה מבוסס רק על מה שרשמת. הוא לא מעיד על מה שלא תועד, ולא נכנס לניקוד, לאתגרים או לקהילה.
      </p>

      <ConfirmDialog
        open={confirmOpen}
        title="לרשום מעידה ולהתחיל מחדש?"
        message="המונה יתחיל מאפס. אפשר לבטל במשך 10 דקות. הרישום נשמר רק במכשיר שלך."
        confirmLabel="לרשום ולהתחיל מחדש"
        cancelLabel="ביטול"
        onConfirm={() => {
          resetSpeech();
          setNow(Date.now());
        }}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
