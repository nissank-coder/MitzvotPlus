import React, { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, Num, PrivacyBadge, ScreenHeader, Surface } from '../components/ds';
import { contentRef, dvarTorahFor } from '../content/registry';
import { useAppStore } from '../store/AppStore';
import { actionDef } from '../data/actions';
import { ds } from '../theme';
import { NO_HEBREW_VOICE_HELP, shareText as shareTextNative, speak, SpeechSupport, speechSupport, stopSpeaking } from '../native/shareSpeech';

type Props = {
  onBack: () => void;
  onOpenProfile: () => void;
};

function todayHebrewLabel(): string {
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('he-IL', { dateStyle: 'full' }).format(new Date());
  }
}

/** Rough reading time (Hebrew prose ~170 words a minute), never less than one minute. */
export function readingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 170));
}

/**
 * "דבר תורה" – design round 1. A reading screen: title, the source as the registry has it (or a
 * clear "demo text – not approved" label for the TEST_ONLY placeholder of internal builds), a
 * comfortable serif text, and ONE explicit button to record learning. Opening or scrolling records
 * nothing. The daily item and the weekly parasha content stay separate (src/content/registry.ts).
 */
export function TorahScreen({ onBack }: Props) {
  const { state, derived, toggleSavedContent, addAction, removeLog, setReflection } = useAppStore();
  const item = dvarTorahFor(derived.todayKey);
  const text = item?.body ?? '';
  const saved = item ? state.savedContent.includes(contentRef(item)) : false;
  const doneLog = item ? derived.todayLogs.find((l) => l.actionKey === 'dailyTorah' && l.content?.id === item.id && l.content.version === item.version) : undefined;
  const [undoOpen, setUndoOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const dateLabel = useMemo(todayHebrewLabel, []);
  const minutes = readingMinutes(text);
  const approved = item?.approval === 'APPROVED';

  // Read-aloud only with a Hebrew voice on the device; otherwise a clear alternative (round 11 §4).
  const [speech, setSpeech] = useState<SpeechSupport | null>(null);
  useEffect(() => {
    let alive = true;
    speechSupport().then((s) => alive && setSpeech(s), () => alive && setSpeech({ available: false, reason: 'unsupported' }));
    return () => {
      alive = false;
      void stopSpeaking();
    };
  }, []);
  const canSpeak = speech !== null && (speech.available || speech.reason === 'no-hebrew-voice');
  const flash = (msg: string, ms = 2500) => {
    setFeedback(msg);
    window.setTimeout(() => setFeedback(null), ms);
  };
  const toggleSpeech = () => {
    if (!speech?.available) return flash(NO_HEBREW_VOICE_HELP, 6000);
    if (isSpeaking) {
      void stopSpeaking();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    void speak(text, () => setIsSpeaking(false));
  };
  const share = async () => {
    const message = `${item?.title ?? 'דבר תורה'} – מצוות+\n\n${text}${item?.source ? `\n\n${item.source.title}${item.source.ref ? ` ${item.source.ref}` : ''}` : ''}`;
    const r = await shareTextNative('דבר תורה – מצוות+', message);
    if (r === 'copied') flash('הטקסט הועתק ללוח לשיתוף');
    else if (r === 'unavailable') flash('שיתוף אינו זמין במכשיר זה');
  };

  // No approved content (production without D08 content): say so plainly, no actions.
  if (!item) {
    return (
      <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-4">
        <ScreenHeader title="דבר תורה" subtitle="רגע קצר של לימוד ומשמעות" onBack={onBack} />
        <Surface className="p-5" role="status">
          <p className="text-ink text-[17px] font-extrabold">דבר תורה יומי יתווסף בקרוב</p>
          <p className="text-ink-muted text-[14px] mt-2 leading-6">
            התכנים יופיעו אחרי שיעברו בדיקת מקור, רישיון ואישור. בינתיים אפשר ללמוד בסידור, בתהילים ובלימוד היומי.
          </p>
        </Surface>
      </div>
    );
  }

  return (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-4">
      <ScreenHeader title="דבר תורה" subtitle="לימוד יומי קצר" onBack={onBack} />

      <Surface as="article" aria-label={item.title} className="p-5 flex flex-col gap-4">
        <div className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-muted">
          <span className="flex flex-row items-center gap-1">
            <AppIcon name="calendar" size={15} color={ds.inkMuted} />
            {dateLabel}
          </span>
          <span className="flex flex-row items-center gap-1">
            <AppIcon name="clock" size={15} color={ds.inkMuted} />
            {minutes === 1 ? 'כדקה של קריאה' : `כ־${minutes} דקות קריאה`}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {!approved ? (
            <span className="self-start rounded-full bg-amber-soft text-amber-ink text-[12px] font-bold px-3 min-h-[28px] inline-flex items-center">
              טקסט הדגמה · לא תוכן מאושר
            </span>
          ) : null}
          <h2 className="text-[24px] font-extrabold text-ink leading-tight">{item.title}</h2>
        </div>
        <p className="reader-text text-[19px] text-ink">{text}</p>
        {/* Source and approval come from the content registry; a placeholder claims no source. */}
        <div className="rounded-[16px] bg-canvas px-4 py-3 flex flex-row items-start gap-2" data-content-ref={contentRef(item)}>
          <AppIcon name="bookmark" size={18} color={ds.brand} />
          <span className="flex-1 text-[14px] text-ink leading-6">
            {approved && item.source ? (
              <>
                <span className="font-bold">מקור: </span>
                {item.source.title}
                {item.source.ref ? `, ${item.source.ref}` : ''}
                {item.author ? ` · ${item.author}` : ''}
              </>
            ) : (
              <>
                <span className="font-bold">אין מקור. </span>
                טקסט זמני לבדיקת המסך בלבד, עד שיאושר תוכן אמיתי.
              </>
            )}
          </span>
        </div>
        <div className="flex flex-row flex-wrap gap-2">
          {canSpeak ? (
            <Button variant="secondary" size="sm" icon={isSpeaking ? 'pause' : 'play'} onClick={toggleSpeech}>
              {isSpeaking ? 'עצירה' : 'האזנה'}
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" icon="share" onClick={share}>
            שיתוף
          </Button>
          <Button variant={saved ? 'ghost' : 'secondary'} size="sm" icon="bookmark" onClick={() => toggleSavedContent(contentRef(item))} aria-pressed={saved}>
            {saved ? 'נשמר' : 'שמירה'}
          </Button>
        </div>
        {feedback ? (
          <p role="status" className="text-[13px] font-bold text-brand">
            {feedback}
          </p>
        ) : null}
      </Surface>

      {/* Recording is explicit: reading is not learning until the user says so. */}
      <Surface as="section" aria-label="רישום לימוד" className="p-4 flex flex-col gap-3">
        {doneLog ? (
          <div className="rounded-[18px] bg-lime-soft p-4 flex flex-row items-center gap-3" role="status">
            <span className="w-10 h-10 rounded-full bg-lime flex items-center justify-center shrink-0" aria-hidden="true">
              <AppIcon name="check" size={20} color={ds.ink} strokeWidth={3} />
            </span>
            <span className="flex-1 flex flex-col">
              <span className="text-[16px] font-extrabold text-ink">הלימוד נרשם להיום</span>
              <span className="text-[13px] text-lime-ink">
                רצף לימוד: <Num>{derived.torahStreak}</Num> {derived.torahStreak === 1 ? 'יום' : 'ימים'}
              </span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => setUndoOpen(true)}>
              ביטול
            </Button>
          </div>
        ) : (
          <>
            <p className="text-[14px] text-ink-muted leading-6">פתיחת הדף אינה נרשמת. כשסיימת ללמוד, רושמים כאן.</p>
            <Button
              variant="primary"
              size="lg"
              icon="check"
              onClick={() => addAction('dailyTorah', { content: { id: item.id, version: item.version } })}
              aria-describedby="torah-points"
            >
              למדתי – לרשום לימוד
            </Button>
            <span id="torah-points" className="text-[12px] text-ink-muted text-center">
              <Num>+{actionDef('dailyTorah').points}</Num> נקודות התמדה · פעם אחת ביום
            </span>
          </>
        )}
      </Surface>

      <Surface as="section" aria-label="הערה אישית" className="p-4 flex flex-col gap-2">
        <div className="flex flex-row items-center justify-between gap-2">
          <label htmlFor="torah-note" className="text-[16px] font-extrabold text-ink">
            הערה אישית
          </label>
          <PrivacyBadge>במכשיר בלבד</PrivacyBadge>
        </div>
        <p className="text-[13px] text-ink-muted">איך זה פוגש אותי היום? מצווה קטנה שאוכל להוסיף?</p>
        <textarea
          id="torah-note"
          value={derived.reflection}
          onChange={(e) => setReflection(e.target.value)}
          rows={3}
          placeholder="אפשר לכתוב כאן תזכורת קצרה לעצמך…"
          className="w-full min-h-[96px] rounded-[14px] bg-canvas border border-line p-3 text-ink text-[16px] leading-6 placeholder:text-ink-muted focus:outline-none focus:border-brand resize-y"
        />
      </Surface>

      <ConfirmDialog
        open={undoOpen}
        title="ביטול רישום הלימוד"
        message="להסיר את רישום הלימוד של היום? אפשר לרשום שוב בכל עת."
        confirmLabel="הסרה"
        cancelLabel="השארה"
        destructive
        onConfirm={() => doneLog && removeLog(doneLog.id)}
        onClose={() => setUndoOpen(false)}
      />
    </div>
  );
}
