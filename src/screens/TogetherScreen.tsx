import React, { useCallback, useEffect, useRef, useState } from 'react';
import { accountApi, AccountApi, AccountUser, Consent } from '../backend/account';
import { supabaseClient } from '../backend/supabase';
import { isCodeShape, localLearningDays, Member, Mine, normalizeCode, Preview, Progress, togetherApi, TogetherApi } from '../backend/together';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, IconBadge, Num, ScreenHeader, SectionTitle, Surface } from '../components/ds';
import { Bar } from '../components/gameplay';
import { cityById } from '../data/locations';
import { useAppStore } from '../store/AppStore';
import { ds } from '../theme';

/**
 * "לומדים יחד" – a private learning challenge for two (main decision doc §4). Real accounts and the
 * real server only (staging builds with VITE_SOCIAL=true); nothing here is demo data.
 *  - Joining needs an account, an explicit "yes" to sharing (what is shown, what is not) and to the
 *    terms (metric, period, comparison). Backup is turned on "from now" unless the user picks history.
 *  - Progress is the server's count of learning days from backed-up entries; this device's own count
 *    is shown next to it, so an entry not yet synced is visible as such.
 *  - Reading never records: "ללימוד היום" opens the learning screen, where only "למדתי" records.
 */
type Props = { onBack: () => void; onOpenProfile: () => void; onOpenLearning: () => void };
type View =
  | { kind: 'hub' }
  | { kind: 'invite'; code: string; expiresAt: string; rematch?: boolean }
  | { kind: 'code' }
  | { kind: 'preview'; code: string; preview: Extract<Preview, { state: 'ok' }> }
  | { kind: 'challenge'; id: string };
type Boot =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'other-space' }
  | { state: 'ready'; api: AccountApi; together: TogetherApi; user: AccountUser; consent: Consent; name: string };

const ERRORS: Record<string, string> = {
  offline: 'אין חיבור כרגע. מה שנרשם נשמר במכשיר; אפשר לנסות שוב.',
  rate_limited: 'יותר מדי ניסיונות. כדאי לנסות שוב בעוד כמה דקות.',
  consent_required: 'צריך לאשר את השיתוף לפני שממשיכים.',
  not_authenticated: 'צריך להיכנס שוב לחשבון.',
};
const errText = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return (code && ERRORS[code]) || 'משהו לא עבד. אפשר לנסות שוב.';
};
const fmt = (d: string | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : '');
const newRequestId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).toString();

export default function TogetherScreen({ onBack, onOpenProfile, onOpenLearning }: Props) {
  const { state, space, runSync } = useAppStore();
  const [boot, setBoot] = useState<Boot>({ state: 'loading' });
  const [view, setView] = useState<View>({ kind: 'hub' });
  const [mine, setMine] = useState<Mine | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'leave' | 'block' | 'stop' | null>(null);
  const pendingCheer = useRef<{ to: string; requestId: string } | null>(null);

  // Account, consent and display name – the server's, read once.
  useEffect(() => {
    let cancelled = false;
    void supabaseClient().then(async (sb) => {
      const api = accountApi(sb);
      const user = await api.currentUser();
      if (cancelled) return;
      if (!user) return setBoot({ state: 'signed-out' });
      if (space !== `user:${user.id}`) return setBoot({ state: 'other-space' });
      const together = togetherApi(sb);
      const [consent, name] = await Promise.all([api.consent().catch(() => ({ cloudBackup: false, social: false })), together.displayName().catch(() => '')]);
      if (!cancelled) setBoot({ state: 'ready', api, together, user, consent, name });
    });
    return () => {
      cancelled = true;
    };
  }, [space]);

  const ready = boot.state === 'ready' ? boot : null;
  const run = useCallback(async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }, []);
  /** Sends this device's entries first (backup must be on), then reads the server's numbers. */
  const sync = useCallback(async () => {
    if (!ready || !ready.consent.cloudBackup) return;
    await runSync(ready.api.remote(), true).catch(() => undefined);
  }, [ready, runSync]);
  const loadMine = useCallback(async () => {
    if (!ready) return;
    setMine(await ready.together.mine());
  }, [ready]);
  const loadProgress = useCallback(
    async (id: string) => {
      if (!ready) return;
      await sync();
      setProgress(await ready.together.progress(id));
    },
    [ready, sync],
  );

  useEffect(() => {
    if (ready && ready.consent.social && ready.consent.cloudBackup) void run(async () => {
      await sync();
      await loadMine();
    });
  }, [ready, run, sync, loadMine]);
  // While a challenge is on screen: refresh every 20 seconds (the partner's progress, cheers).
  useEffect(() => {
    if (view.kind !== 'challenge') return;
    void run(() => loadProgress(view.id));
    const t = window.setInterval(() => void loadProgress(view.id).catch(() => undefined), 20_000);
    return () => window.clearInterval(t);
  }, [view, run, loadProgress]);

  const header = (subtitle?: string) => (
    <ScreenHeader
      title="לומדים יחד"
      subtitle={subtitle ?? 'אתגר לימוד פרטי עם חבר'}
      onBack={view.kind === 'hub' ? onBack : () => (setView({ kind: 'hub' }), setProgress(null), void loadMine().catch(() => undefined))}
    />
  );
  const feedback = (
    <>
      {error ? (
        <p role="alert" className="rounded-[14px] bg-danger-soft text-ink text-[14px] px-3 py-2.5" data-testid="together-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="rounded-[14px] bg-lime-soft text-lime-ink text-[14px] font-bold px-3 py-2.5" data-testid="together-notice">
          {notice}
        </p>
      ) : null}
    </>
  );
  const page = (children: React.ReactNode, subtitle?: string) => (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-4" aria-busy={busy}>
      {header(subtitle)}
      {feedback}
      {children}
    </div>
  );

  if (boot.state === 'loading') return page(<p className="text-ink-muted">טוען…</p>);
  if (boot.state === 'signed-out' || boot.state === 'other-space')
    return page(
      <Surface className="p-5 flex flex-col gap-3">
        <IconBadge name="community" size={48} />
        <h2 className="text-[19px] font-extrabold text-ink">אתגר לימוד פרטי – אתה וחבר</h2>
        <p className="text-[15px] leading-6 text-ink">
          מזמינים חבר אחד, כל אחד לומד בקצב שלו, ושניכם רואים כמה ימי לימוד כל אחד צבר. כדי להתחיל צריך {boot.state === 'signed-out' ? 'להיכנס לחשבון' : 'לפתוח את נתוני החשבון במכשיר'}.
        </p>
        <Button onClick={onOpenProfile} icon="user">
          {boot.state === 'signed-out' ? 'כניסה לחשבון' : 'פתיחת החשבון'}
        </Button>
      </Surface>,
    );

  const r = ready!;
  if (!r.consent.social || !r.consent.cloudBackup) return page(<ConsentView boot={r} busy={busy} run={run} onDone={(next) => setBoot(next)} onBack={onBack} />, 'לפני שמתחילים');

  /* ------------------------------ challenge ------------------------------ */
  if (view.kind === 'challenge') {
    const p = progress;
    if (!p) return page(<p className="text-ink-muted">טוען את ההתקדמות…</p>);
    if (p.state === 'unavailable') return page(<p className="text-ink">האתגר הזה כבר לא זמין לך.</p>);
    const me = p.members.find((m) => m.isMe)!;
    const partner = p.members.find((m) => !m.isMe);
    const local = localLearningDays(state.logs, p.startDate, p.endDate, p.today);
    const confirmed = me.days ?? 0;
    const cheer = (to: Member) =>
      run(async () => {
        const requestId = pendingCheer.current?.to === to.userId ? pendingCheer.current.requestId : newRequestId();
        pendingCheer.current = { to: to.userId, requestId }; // a retry after a network error is the same cheer
        const res = await r.together.cheer(view.id, to.userId, requestId);
        pendingCheer.current = null;
        setNotice(res === 'ok' || res === 'duplicate' ? `שלחת יישר כוח ל${to.name}` : res === 'already_today' ? 'כבר שלחת יישר כוח היום' : 'אי אפשר לשלוח כרגע');
        await loadProgress(view.id);
      });
    const outcome = p.result
      ? p.result.outcome === 'first'
        ? 'צברת יותר ימי לימוד הפעם'
        : p.result.outcome === 'tie'
          ? 'שוויון – לשניכם אותו מספר ימי לימוד'
          : p.result.outcome === 'second'
            ? `${partner?.name ?? 'החבר'} צבר יותר ימי לימוד הפעם`
            : 'האתגר הסתיים'
      : null;
    return page(
      <>
        <Surface tone="brand" className="p-4 flex flex-col gap-2 rounded-[var(--radius-hero)]" data-testid="together-hero">
          <span className="text-[12px] font-bold text-on-brand-muted">
            {p.state === 'finished' ? 'האתגר הסתיים' : p.state === 'pending' ? 'ממתין שהחבר יצטרף' : `יום ${dayIndex(p.startDate, p.today)} מתוך ${p.days} · ${fmt(p.startDate)}–${fmt(p.endDate)}`}
          </span>
          <span className="text-[19px] font-extrabold leading-snug" data-testid="together-headline">
            {p.state === 'finished' ? outcome : partialText(confirmed, p.target)}
          </span>
          {p.state === 'finished' ? (
            <span className="text-[14px] text-on-brand-muted">{p.result?.met ? `הגעת ליעד: ${p.target} ימי לימוד ומעלה.` : `הפעם לא הגעת ל-${p.target} ימים – אפשר לנסות שוב.`}</span>
          ) : null}
        </Surface>

        <Surface className="p-4 flex flex-col gap-4" aria-label="ההתקדמות המשותפת">
          <SectionTitle title={`${p.target} ימי לימוד בתוך ${p.days} ימים`} />
          {p.members.map((m) => (
            <div key={m.userId} className="flex flex-col gap-1.5" data-testid={m.isMe ? 'together-me' : 'together-partner'}>
              <div className="flex flex-row items-baseline justify-between gap-2">
                <span className="text-[15px] font-extrabold text-ink">{m.isMe ? `${m.name} (את/ה)` : m.name}</span>
                <span className="text-[14px] font-bold text-ink">
                  {m.visibility === 'visible' ? (
                    <>
                      <Num>{m.days ?? 0}</Num> מתוך <Num>{p.target}</Num>
                    </>
                  ) : m.visibility === 'left' ? (
                    'עזב את האתגר'
                  ) : (
                    'לא משתף כרגע'
                  )}
                </span>
              </div>
              {m.visibility === 'visible' ? <Bar value={m.days ?? 0} max={p.target} color={(m.days ?? 0) >= p.target ? ds.limeDeep : ds.brand} label={`${m.name}: ${m.days ?? 0} מתוך ${p.target}`} /> : null}
              {m.isMe && local > confirmed ? (
                <span className="text-[12px] text-ink-muted" data-testid="together-pending">
                  נשמר במכשיר: <Num>{local}</Num> {local === 1 ? 'יום' : 'ימים'}. יעודכן כאן אחרי סנכרון.
                </span>
              ) : null}
              {m.cheersReceived > 0 ? <span className="text-[12px] text-ink-muted">{m.isMe ? 'קיבלת' : 'קיבל'} {m.cheersReceived} יישר כוח</span> : null}
              {!m.isMe && m.visibility === 'visible' && p.state === 'active' ? (
                <Button variant="secondary" size="sm" icon="heart" disabled={busy || m.cheeredToday} onClick={() => void cheer(m)} aria-label={`יישר כוח ל${m.name}`}>
                  {m.cheeredToday ? 'שלחת יישר כוח היום' : 'יישר כוח'}
                </Button>
              ) : null}
            </div>
          ))}
          <p className="text-[12px] leading-5 text-ink-muted">
            יום לימוד = יום שבו נרשם לימוד אחד לפחות. פתיחה וקריאה לא נרשמות – רק "למדתי". מי שצבר יותר ימים – ראשון; אותו מספר – שוויון. האתגר נסגר יום אחרי היום האחרון ({fmt(p.closesOn)}).
          </p>
        </Surface>

        {p.state === 'active' ? (
          <div className="flex flex-col gap-2">
            <Button onClick={onOpenLearning} icon="book">
              ללימוד היום
            </Button>
            <Button variant="ghost" icon="reset" disabled={busy} onClick={() => void run(() => loadProgress(view.id))}>
              רענון ההתקדמות
            </Button>
          </div>
        ) : null}
        {p.state === 'finished' && partner && partner.visibility === 'visible' ? (
          <Button
            icon="plus"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const inv = await r.together.rematch(view.id);
                setView({ kind: 'invite', code: inv.code, expiresAt: inv.expiresAt, rematch: true });
              })
            }
          >
            סיבוב נוסף עם {partner.name}
          </Button>
        ) : null}
        {p.state !== 'finished' ? (
          <div className="flex flex-row flex-wrap gap-2">
            <Button variant="danger" size="sm" onClick={() => setConfirm('leave')}>
              עזיבת האתגר
            </Button>
            {partner && partner.visibility !== 'left' ? (
              <Button variant="danger" size="sm" onClick={() => setConfirm('block')}>
                חסימה
              </Button>
            ) : null}
          </div>
        ) : null}
        <ConfirmDialog
          open={confirm === 'leave'}
          title="לעזוב את האתגר?"
          message="ההתקדמות שלך לא תוצג יותר לחבר, ולא תוכל לחזור לאתגר הזה. הרישומים שלך נשארים אצלך."
          confirmLabel="עזיבה"
          cancelLabel="ביטול"
          destructive
          onConfirm={() =>
            void run(async () => {
              await r.together.leave(view.id);
              setConfirm(null);
              setView({ kind: 'hub' });
              await loadMine();
            })
          }
          onClose={() => setConfirm(null)}
        />
        <ConfirmDialog
          open={confirm === 'block'}
          title={`לחסום את ${partner?.name ?? 'החבר'}?`}
          message="לא תראו זה את ההתקדמות של זה, לא תוכלו לשלוח יישר כוח ולא להזמין זה את זה."
          confirmLabel="חסימה"
          cancelLabel="ביטול"
          destructive
          onConfirm={() =>
            void run(async () => {
              if (partner) await r.together.block(partner.userId);
              setConfirm(null);
              await loadProgress(view.id);
            })
          }
          onClose={() => setConfirm(null)}
        />
      </>,
    );
  }

  /* ------------------------------ an invitation was created ------------------------------ */
  if (view.kind === 'invite') {
    const text = `הזמנה ל"לומדים יחד" במצוות+: 3 ימי לימוד בתוך 7 ימים. הקוד: ${view.code}`;
    return page(
      <Surface className="p-5 flex flex-col gap-3 items-stretch">
        <span className="text-[14px] text-ink-muted">{view.rematch ? 'ההזמנה מחכה לחבר בתוך האפליקציה. אפשר גם לשלוח את הקוד:' : 'שולחים לחבר את הקוד. רק מי שמקבל אותו יכול להצטרף.'}</span>
        <span className="text-center text-[32px] font-extrabold tracking-[0.25em] text-brand num" data-testid="together-code" dir="ltr">
          {view.code}
        </span>
        <span className="text-[13px] text-ink-muted text-center">בתוקף עד {new Date(view.expiresAt).toLocaleDateString('he-IL')} · לשימוש אחד</span>
        <Button
          icon="share"
          onClick={() =>
            void (async () => {
              try {
                const canShare = typeof (navigator as { share?: unknown }).share === 'function';
                if (canShare) await navigator.share({ text });
                else await navigator.clipboard.writeText(text);
                setNotice(canShare ? 'נפתח שיתוף' : 'הקוד הועתק');
              } catch {
                /* the user closed the share sheet */
              }
            })()
          }
        >
          שליחת הקוד לחבר
        </Button>
      </Surface>,
      'הזמנת חבר',
    );
  }

  /* ------------------------------ entering a code / the terms ------------------------------ */
  if (view.kind === 'code') return page(<CodeView busy={busy} onPreview={(code) => void run(async () => {
    const pv = await r.together.preview(code);
    if (pv.state !== 'ok') return setError('הקוד לא תקף: אולי כבר נוצל, פג תוקפו או שנכתב אחרת.');
    setView({ kind: 'preview', code, preview: pv });
  })} />, 'הצטרפות עם קוד');
  if (view.kind === 'preview')
    return page(
      <TermsView
        preview={view.preview}
        busy={busy}
        onJoin={() =>
          void run(async () => {
            const res = await r.together.join(view.code, true);
            if (res.state !== 'joined') return setError('לא ניתן להצטרף עם הקוד הזה.');
            setNotice('הצטרפת לאתגר. בהצלחה!');
            setView({ kind: 'challenge', id: res.challengeId });
          })
        }
      />,
      'לפני ההצטרפות',
    );

  /* ------------------------------ hub ------------------------------ */
  const challenges = (mine?.challenges ?? []).filter((c) => c.state !== 'cancelled');
  return page(
    <>
      {mine?.invitations.length ? (
        <Surface className="p-4 flex flex-col gap-2" aria-label="הזמנות שמחכות לך">
          <SectionTitle title="הזמנות שמחכות לך" />
          {mine.invitations.map((i) => (
            <div key={i.code} className="flex flex-row items-center gap-3">
              <span className="flex-1 text-[15px] text-ink">
                <span className="font-extrabold">{i.inviter}</span> מזמין לסיבוב נוסף
              </span>
              <Button size="sm" onClick={() => void run(async () => {
                const pv = await r.together.preview(i.code);
                if (pv.state === 'ok') setView({ kind: 'preview', code: i.code, preview: pv });
                else setError('ההזמנה כבר לא בתוקף.');
              })}>
                לפרטים
              </Button>
            </div>
          ))}
        </Surface>
      ) : null}

      {challenges.length ? (
        <section className="flex flex-col gap-3" aria-label="האתגרים שלי">
          {challenges.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => (c.state === 'pending' && c.invite ? setView({ kind: 'invite', code: c.invite.code, expiresAt: c.invite.expiresAt }) : setView({ kind: 'challenge', id: c.id }))}
              className="text-right rounded-[var(--radius-card)] bg-surface border border-line p-4 min-h-[64px] flex flex-row items-center gap-3"
              data-testid="together-card"
            >
              <IconBadge name={c.state === 'finished' ? 'trophy' : 'community'} tone={c.state === 'finished' ? 'lime' : 'brand'} />
              <span className="flex-1 flex flex-col">
                <span className="text-[15px] font-extrabold text-ink">
                  {c.target} ימי לימוד בתוך {c.days} ימים
                </span>
                <span className="text-[13px] text-ink-muted">
                  {c.state === 'pending' ? 'ממתין שהחבר יצטרף · הקוד אצלך' : c.state === 'finished' ? 'הסתיים · לתוצאה' : `פעיל · ${fmt(c.startDate)}–${fmt(c.endDate)}`}
                </span>
              </span>
            </button>
          ))}
        </section>
      ) : (
        <Surface tone="brand" className="p-4 flex flex-col gap-1 rounded-[var(--radius-hero)]">
          <span className="text-[12px] font-bold text-on-brand-muted">עוד אין אתגר</span>
          <span className="text-[18px] font-extrabold">מזמינים חבר אחד ולומדים יחד שבוע</span>
          <span className="text-[13px] text-on-brand-muted">3 ימי לימוד בתוך 7 ימים. כל אחד לומד מה שהוא רוצה.</span>
        </Surface>
      )}

      <div className="flex flex-col gap-2">
        <Button
          icon="plus"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const inv = await r.together.createInvite(cityById(state.profile.cityId).tzid);
              setView({ kind: 'invite', code: inv.code, expiresAt: inv.expiresAt });
            })
          }
        >
          הזמנת חבר לאתגר
        </Button>
        <Button variant="secondary" onClick={() => setView({ kind: 'code' })}>
          קיבלתי קוד
        </Button>
      </div>

      <p className="text-[12px] leading-5 text-ink-muted">
        החבר רואה רק את שם התצוגה שלך ({r.name || 'לא נבחר'}) ואת מספר ימי הלימוד באתגר. רישומים, שעות ופעולות אחרות – לא. שמירת הלשון, צדקה וביקור חולים לא יוצאים מהמכשיר.
      </p>
      <Button variant="ghost" size="sm" onClick={() => setConfirm('stop')}>
        הפסקת השיתוף
      </Button>
      <ConfirmDialog
        open={confirm === 'stop'}
        title="להפסיק את השיתוף?"
        message="החברים באתגרים שלך לא יראו יותר את ההתקדמות שלך, ואי אפשר יהיה לשלוח או לקבל יישר כוח. הגיבוי נשאר כפי שהוא."
        confirmLabel="הפסקה"
        cancelLabel="ביטול"
        destructive
        onConfirm={() =>
          void run(async () => {
            await r.api.setConsent({ cloudBackup: r.consent.cloudBackup, social: false });
            setConfirm(null);
            setBoot({ ...r, consent: { ...r.consent, social: false } });
          })
        }
        onClose={() => setConfirm(null)}
      />
    </>,
  );
}

const dayIndex = (start: string | null, today: string) => (start ? Math.max(1, Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000) + 1) : 0);
/** Partial progress in words – also before the goal. */
export function partialText(days: number, target: number): string {
  if (days >= target) return `השלמת ${target} ימי לימוד – כל הכבוד!`;
  if (days === 0) return 'עוד לא נספר יום לימוד. אפשר להתחיל היום.';
  const left = target - days;
  return `${days === 1 ? 'יום לימוד אחד' : `${days} ימי לימוד`} מתוך ${target} – ${left === 1 ? 'עוד יום אחד' : `עוד ${left} ימים`}`;
}

/* ------------------------------ consent ------------------------------ */
function ConsentView({ boot, busy, run, onDone, onBack }: { boot: Extract<Boot, { state: 'ready' }>; busy: boolean; run: (fn: () => Promise<void>) => Promise<void>; onDone: (b: Boot) => void; onBack: () => void }) {
  const [name, setName] = useState(boot.name);
  const [history, setHistory] = useState(false);
  const backupOff = !boot.consent.cloudBackup;
  return (
    <Surface className="p-5 flex flex-col gap-4" aria-label="מה משתפים">
      <div className="flex flex-col gap-1">
        <h2 className="text-[18px] font-extrabold text-ink">מה החבר יראה</h2>
        <ul className="list-disc pr-5 text-[14px] leading-6 text-ink">
          <li>שם התצוגה שתבחר</li>
          <li>שאתה משתתף באתגר</li>
          <li>כמה ימי לימוד צברת באתגר</li>
        </ul>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-extrabold text-ink">מה לא יוצג</h2>
        <p className="text-[14px] leading-6 text-ink">הרישומים עצמם, שעות, תפילות, ברכות וכל פעולה אחרת. שמירת הלשון, צדקה וביקור חולים לא יוצאים מהמכשיר בכלל.</p>
      </div>
      {backupOff ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[16px] font-extrabold text-ink mb-1">גיבוי לחשבון</legend>
          <p className="text-[14px] leading-6 text-ink">כדי שימי הלימוד ייספרו, הרישומים צריכים להגיע לשרת. זה מפעיל גיבוי של הרישומים שאינם פרטיים.</p>
          <label className="min-h-[44px] flex flex-row items-center gap-2 text-[15px]">
            <input type="radio" name="scope" checked={!history} onChange={() => setHistory(false)} /> רק מעכשיו (מומלץ) – מה שנרשם עד היום נשאר במכשיר
          </label>
          <label className="min-h-[44px] flex flex-row items-center gap-2 text-[15px]">
            <input type="radio" name="scope" checked={history} onChange={() => setHistory(true)} /> גם ההיסטוריה הקודמת
          </label>
        </fieldset>
      ) : null}
      <label className="flex flex-col gap-1 text-[15px] font-bold text-ink">
        שם תצוגה
        <input
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          placeholder="למשל: דניאל"
          className="min-h-[48px] rounded-[14px] border border-line px-3 text-[16px] font-normal"
          data-testid="together-name"
        />
      </label>
      <p className="text-[12px] leading-5 text-ink-muted">אפשר להפסיק את השיתוף, לעזוב אתגר או לחסום חבר בכל רגע.</p>
      <Button
        disabled={busy || name.trim().length === 0}
        onClick={() =>
          void run(async () => {
            await boot.together.setDisplayName(name);
            await boot.api.setConsent({ cloudBackup: true, social: true });
            if (backupOff && !history) await boot.together.backupFromNow();
            onDone({ ...boot, consent: { cloudBackup: true, social: true }, name: name.trim() });
          })
        }
      >
        מסכים ומשתתף
      </Button>
      <Button variant="ghost" onClick={onBack}>
        לא עכשיו
      </Button>
    </Surface>
  );
}

function CodeView({ busy, onPreview }: { busy: boolean; onPreview: (code: string) => void }) {
  const [raw, setRaw] = useState('');
  const code = normalizeCode(raw);
  return (
    <Surface className="p-5 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-[15px] font-bold text-ink">
        הקוד שקיבלת
        <input
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          inputMode="text"
          autoCapitalize="characters"
          dir="ltr"
          placeholder="ABCD2345"
          className="min-h-[52px] rounded-[14px] border border-line px-3 text-[22px] tracking-[0.2em] text-center num"
          data-testid="together-code-input"
        />
      </label>
      <Button disabled={busy || !isCodeShape(code)} onClick={() => onPreview(code)}>
        המשך
      </Button>
    </Surface>
  );
}

function TermsView({ preview, busy, onJoin }: { preview: Extract<Preview, { state: 'ok' }>; busy: boolean; onJoin: () => void }) {
  const [agree, setAgree] = useState(false);
  return (
    <Surface className="p-5 flex flex-col gap-3" aria-label="תנאי האתגר">
      <span className="text-[14px] text-ink-muted">
        <span className="font-extrabold text-ink">{preview.inviter}</span> מזמין אותך ל"לומדים יחד"
      </span>
      <h2 className="text-[19px] font-extrabold text-ink">
        {preview.target} ימי לימוד בתוך {preview.days} ימים
      </h2>
      <ul className="list-disc pr-5 text-[14px] leading-6 text-ink" data-testid="together-terms">
        <li>
          <span className="font-bold">המדד:</span> יום לימוד = יום שבו רשמת "למדתי" לפחות פעם אחת. פתיחה וקריאה לא נספרות.
        </li>
        <li>
          <span className="font-bold">התקופה:</span> {preview.days} ימים, מהיום שבו מצטרפים. שבת וחג לא נספרים כחסרים; לימוד שנרשם אחריהם בתוך התקופה נספר.
        </li>
        <li>
          <span className="font-bold">ההשוואה:</span> שניכם רואים כמה ימי לימוד כל אחד צבר. מי שצבר יותר – ראשון; אותו מספר – שוויון.
        </li>
        <li>
          <span className="font-bold">מה משותף:</span> שם התצוגה ומספר ימי הלימוד בלבד.
        </li>
      </ul>
      <label className="min-h-[44px] flex flex-row items-center gap-2 text-[15px] font-bold text-ink">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} data-testid="together-agree" /> קראתי ואני מצטרף/ת
      </label>
      <Button disabled={busy || !agree} onClick={onJoin}>
        הצטרפות לאתגר
      </Button>
    </Surface>
  );
}
