import React, { useCallback, useEffect, useRef, useState } from 'react';
import { accountApi, AccountApi, AccountUser, Consent } from '../backend/account';
import { supabaseClient } from '../backend/supabase';
import { BACKEND } from '../backend/config';
import { AuthCallback, authRedirect, enabledProviders, OAuthProvider, onAuthCallback, parseAuthCallback } from '../backend/oauth';
import { useAppStore } from '../store/AppStore';
import type { SyncErrorCode, SyncStatus } from '../sync/engine';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * "חשבון וסנכרון" – development / staging builds only (BACKEND_ENABLED); lazy-loaded so production
 * bundles contain none of it. Guest by default; sign-in with an e-mail one-time code.
 *
 * Round 12.5 – every account has its own data space on the device (history, settings, queue,
 * cursor). Nothing moves between them unless the user confirms it: guest → account when signing
 * in, or a deleted account → guest. Signing out returns to the guest's own data.
 */
const GUEST = 'guest';
/** Staging test accounts: e-mail + password (VITE_AUTH_PASSWORD=true; never in a production build). */
const PASSWORD_LOGIN = import.meta.env.VITE_AUTH_PASSWORD === 'true' && BACKEND.env === 'staging';
const spaceOf = (u: AccountUser) => `user:${u.id}`;

const STATUS_TEXT: Record<SyncStatus['state'], string> = {
  off: 'כבוי',
  'signed-out': 'לא מחובר',
  'consent-needed': 'גיבוי כבוי – לא נשלח דבר',
  syncing: 'מסנכרן…',
  ok: 'מסונכרן',
  error: 'לא סונכרן',
  cancelled: 'הסנכרון הופסק',
  'account-deleted': 'החשבון נמחק',
  'decision-needed': 'ממתין לבחירה שלך: מה לגבות',
};
const ERROR_TEXT: Record<SyncErrorCode, string> = {
  offline: 'אין חיבור לשרת. הנתונים שמורים במכשיר וישלחו בפעם הבאה.',
  not_authenticated: 'החיבור לחשבון פג. התחברו שוב.',
  consent_required: 'הגיבוי כבוי בשרת. לא נשלח דבר.',
  account_deleted: 'החשבון נמחק.',
  rate_limited: 'יותר מדי בקשות. ננסה שוב מאוחר יותר.',
  local_save_failed: 'השמירה במכשיר נכשלה, ולכן לא נשלח ולא התקבל דבר.',
  backup_changed: 'הגיבוי נמחק בטלפון אחר. התור נבנה מחדש לפי הבחירה שחלה על החשבון.',
  backup_decision_required: 'הגיבוי נמחק. לפני שליחה צריך לבחור מה לגבות.',
  goals_conflict: 'היעדים שונו בטלפון אחר באותו זמן. ננסה שוב בסנכרון הבא.',
  unknown: 'שגיאה בסנכרון. הנתונים שמורים במכשיר.',
};

const AUTH_TEXT: Record<string, string> = {
  password_invalid: 'הדוא״ל או הסיסמה לא נכונים.',
  code_invalid_or_expired: 'הקוד שגוי או שפג תוקפו. אפשר לבקש קוד חדש.',
  code_rate_limited: 'אפשר לבקש קוד חדש בעוד דקה.',
  oauth_failed: 'ההתחברות לא הושלמה. אפשר לנסות שוב או להמשיך כאורח.',
};
const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'המשך עם Google', apple: 'המשך עם Apple' };
const PROVIDERS = enabledProviders();
const isNative = () => Boolean((window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

type Dialog = 'transfer' | 'logout' | 'logout-wipe' | 'delete' | 'revoke' | 'reupload' | null;

export default function AccountSection() {
  const { runSync, cancelSync, space, spaceCount, switchSpace, markCloudDeleted, flush } = useAppStore();
  /** Round 13 (B1): the backup generation that waits for the user's choice after a deletion. */
  const [decisionEpoch, setDecisionEpoch] = useState<number | null>(null);
  const [api, setApi] = useState<AccountApi | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [pendingUser, setPendingUser] = useState<AccountUser | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [consent, setConsentState] = useState<Consent>({ cloudBackup: false, social: false });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [status, setStatus] = useState<SyncStatus>({ state: 'signed-out' });
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  // ConfirmDialog calls onClose after onConfirm too: "cancel" actions run only if not confirmed.
  const confirmed = useRef(false);
  const onConfirmOf = (fn: () => void) => () => {
    confirmed.current = true;
    fn();
  };
  const onCancelOf = (fn: () => void) => () => {
    const wasConfirmed = confirmed.current;
    confirmed.current = false;
    setDialog(null);
    if (!wasConfirmed) fn();
  };

  useEffect(() => {
    void supabaseClient().then(async (sb) => {
      const a = accountApi(sb);
      setApi(a);
      const u = await a.currentUser();
      setUser(u);
      if (u) setConsentState(await a.consent().catch(() => ({ cloudBackup: false, social: false })));
    });
  }, []);

  // Round 13: the return from Google / Apple – a deep link (native, also on a cold start) or the
  // page's own address (web). Cancelled at the provider: nothing changes, the user stays a guest.
  const finishSignIn = useRef<(cb: AuthCallback) => void>(() => undefined);
  finishSignIn.current = (cb) => {
    if (!api) return;
    if (cb.kind === 'error') {
      setMessage(cb.error === 'access_denied' ? 'ההתחברות בוטלה. אפשר להמשיך כאורח.' : (AUTH_TEXT.oauth_failed ?? null));
      return;
    }
    void run(async () => {
      const u = await api.finishOAuth(cb.code);
      setUser(u);
      setConsentState(await api.consent());
      setStatus({ state: 'off' });
      await enterAccount(u);
    });
  };
  useEffect(() => {
    if (!api) return;
    const web = parseAuthCallback(window.location.href, window.location.origin);
    if (web) {
      window.history.replaceState(null, '', window.location.pathname); // the code is used once
      finishSignIn.current(web);
    }
    return onAuthCallback((cb) => finishSignIn.current(cb));
  }, [api]);
  const startSignIn = (provider: OAuthProvider) =>
    run(async () => {
      if (!api) return;
      const url = await api.startOAuth(provider, authRedirect(isNative(), window.location.origin));
      // The system browser (never a web view inside the app): Capacitor hands an outside address
      // to the browser; on the web the page itself goes there and comes back.
      window.location.assign(url);
    });

  const run = async (fn: () => Promise<void>) => {
    setMessage(null);
    setNotice(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMessage(AUTH_TEXT[m] ?? (m === 'local_save_failed' ? ERROR_TEXT.local_save_failed : /fetch|network|offline/i.test(m) ? ERROR_TEXT.offline : m));
    } finally {
      setBusy(false);
    }
  };

  /** After a successful sign-in: show this account's own data; offer to move the guest's data. */
  const enterAccount = async (u: AccountUser) => {
    const target = spaceOf(u);
    if (space === target) return;
    const n = space === GUEST ? await spaceCount(GUEST) : 0;
    if (n > 0) {
      setGuestCount(n);
      setPendingUser(u);
      setDialog('transfer');
      return;
    }
    await switchSpace(target);
  };

  const sync = useCallback(async () => {
    if (!api || !user || space !== spaceOf(user)) return;
    setStatus({ state: 'syncing' });
    const s = await runSync(api.remote(), consent.cloudBackup);
    setStatus(s);
    if (s.state === 'account-deleted') setUser(null);
    // The cloud copy was deleted (here or on another phone): the choice is the user's, once for all phones.
    if (s.state === 'decision-needed') {
      const b = await api.backupState().catch(() => null);
      if (b?.decisionPending) {
        setDecisionEpoch(b.epoch);
        setDialog('reupload');
      }
    }
  }, [api, user, space, consent.cloudBackup, runSync]);

  /** "All history" or "only from now" – stored on the server, so every phone of the account follows it. */
  const decide = (all: boolean) =>
    run(async () => {
      if (!api || decisionEpoch === null) return;
      await api.setBackupScope(decisionEpoch, all);
      setDecisionEpoch(null);
      setNotice(all ? 'הגיבוי יכלול את כל מה שקיים בטלפונים, בלי מה שנמחק.' : 'יגובה רק מה שיירשם מעכשיו, בכל הטלפונים בחשבון.');
      await sync();
    });

  const leave = async (wipe: boolean) => {
    if (!api || !user) return;
    const mine = spaceOf(user);
    cancelSync();
    // Order: (1) save – if the device cannot save, stay signed in and lose nothing; (2) end the
    // session – the screens reload during the switch and must not find it any more; (3) switch.
    if (!(await flush())) throw new Error('local_save_failed');
    const { serverRevoked } = await api.signOut();
    setUser(null);
    await switchSpace(GUEST, wipe ? { deleteSpace: mine } : {});
    setStatus({ state: 'signed-out' });
    setNotice(serverRevoked ? 'התנתקת.' : 'התנתקת במכשיר הזה. השרת לא היה זמין, והחיבור הישן יפוג מעצמו.');
  };

  if (!api) return <p className="text-[13px] text-[#5C6F82]">טוען חשבון…</p>;

  const mismatch = user !== null && space !== spaceOf(user);
  const orphanAccountSpace = user === null && space !== GUEST;

  return (
    <div dir="rtl" className="flex flex-col gap-3" data-testid="account-section">
      <p className="text-[11px] text-[#8A5A00] bg-[#FFF5DB] rounded px-2 py-1 self-start">שרת {BACKEND.env === 'staging' ? 'בדיקות (staging)' : 'פיתוח'} – לא ייצור</p>

      {status.state === 'account-deleted' && space !== GUEST ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-[#FDF0EF] p-3" data-testid="account-deleted">
          <p className="text-[13px] text-[#17324D]">החשבון נמחק בשרת. הנתונים שלו עדיין במכשיר הזה. מה לעשות בהם?</p>
          <button type="button" disabled={busy} onClick={() => run(async () => { await api.signOut(); setStatus({ state: 'signed-out' }); await switchSpace(GUEST, { transferFrom: space }); })} className="min-h-[44px] rounded-[14px] border border-[#DDE8EE] font-bold text-[#17324D]">
            להעביר אותם לשימוש כאורח
          </button>
          <button type="button" disabled={busy} onClick={() => run(async () => { await api.signOut(); setStatus({ state: 'signed-out' }); await switchSpace(GUEST, { deleteSpace: space }); })} className="min-h-[44px] rounded-[14px] text-[#C95B53] font-black">
            למחוק אותם מהמכשיר
          </button>
        </div>
      ) : null}

      {orphanAccountSpace && status.state !== 'account-deleted' ? (
        <div className="flex flex-col gap-2 rounded-[14px] bg-[#F4F8FB] p-3">
          <p className="text-[13px] text-[#17324D]">החיבור לחשבון פג. הנתונים המוצגים הם של החשבון. התחברו שוב כדי להמשיך לסנכרן.</p>
          <button type="button" disabled={busy} onClick={() => run(() => switchSpace(GUEST))} className="min-h-[44px] rounded-[14px] border border-[#DDE8EE] font-bold text-[#17324D]">
            מעבר לנתוני האורח
          </button>
        </div>
      ) : null}

      {!user ? (
        step === 'email' ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-[#5C6F82]">אפשר להמשיך כאורח. לכל חשבון יש נתונים נפרדים במכשיר. מה שנרשם כאורח עובר לחשבון רק אם תאשרו זאת.</p>
            {PROVIDERS.map((p) => (
              <button key={p} type="button" disabled={busy} onClick={() => void startSignIn(p)} className="min-h-[48px] rounded-[14px] border border-[#DDE8EE] bg-white font-extrabold text-[#17324D]" data-testid={`signin-${p}`}>
                {PROVIDER_LABEL[p]}
              </button>
            ))}
            {PASSWORD_LOGIN ? (
              <div className="flex flex-col gap-2 rounded-[14px] bg-[#FFF5DB] p-3" data-testid="password-signin">
                <p className="text-[12px] text-[#8A5A00]">חשבון בדיקה (staging בלבד): דוא״ל וסיסמה שנוצרו בלוח הבקרה.</p>
                <input aria-label="דוא״ל חשבון בדיקה" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-[48px] rounded-[14px] border border-[#DDE8EE] px-3 bg-white" />
                <input aria-label="סיסמת חשבון בדיקה" type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="min-h-[48px] rounded-[14px] border border-[#DDE8EE] px-3 bg-white" />
                <button
                  type="button"
                  disabled={busy || !email || !password}
                  onClick={() =>
                    run(async () => {
                      const u = await api.signInWithPassword(email, password);
                      setPassword('');
                      setUser(u);
                      setConsentState(await api.consent());
                      setStatus({ state: 'off' });
                      await enterAccount(u);
                    })
                  }
                  className="min-h-[48px] rounded-[14px] bg-brand text-white font-extrabold"
                >
                  כניסה לחשבון בדיקה
                </button>
              </div>
            ) : null}
            {PROVIDERS.length > 0 ? <p className="text-[12px] text-[#5C6F82]">או עם קוד בדוא״ל:</p> : null}
            <label className="text-[13px] font-bold text-[#17324D]" htmlFor="acct-email">דוא״ל</label>
            <input id="acct-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-[48px] rounded-[14px] border border-[#DDE8EE] px-3" />
            <button type="button" disabled={busy || !/^\S+@\S+\.\S+$/.test(email)} onClick={() => run(async () => { await api.requestCode(email); setStep('code'); })} className="min-h-[48px] rounded-[14px] bg-[#2AAE9B] disabled:bg-[#A7B4C0] text-white font-extrabold">
              שליחת קוד התחברות
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-bold text-[#17324D]" htmlFor="acct-code">הקוד שנשלח ל-{email}</label>
            <input id="acct-code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} className="min-h-[48px] rounded-[14px] border border-[#DDE8EE] px-3 tracking-widest" />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const u = await api.verifyCode(email, code);
                  setUser(u);
                  setConsentState(await api.consent());
                  setStep('email');
                  setCode('');
                  setStatus({ state: 'off' });
                  await enterAccount(u);
                })
              }
              className="min-h-[48px] rounded-[14px] bg-[#2AAE9B] text-white font-extrabold"
            >
              התחברות
            </button>
            <button type="button" onClick={() => setStep('email')} className="min-h-[40px] text-[13px] text-[#5C6F82]">חזרה</button>
          </div>
        )
      ) : mismatch ? (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] text-[#17324D]">מחובר: <span dir="ltr">{user.email}</span>. הנתונים המוצגים אינם של החשבון הזה.</p>
          <button type="button" disabled={busy} onClick={() => run(() => enterAccount(user))} className="min-h-[44px] rounded-[14px] bg-[#2AAE9B] text-white font-extrabold">מעבר לנתוני החשבון</button>
          <button type="button" disabled={busy} onClick={() => run(async () => { await api.signOut(); setUser(null); })} className="min-h-[44px] rounded-[14px] border border-[#DDE8EE] text-[#17324D] font-bold">התנתקות</button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] text-[#17324D]">מחובר: <span dir="ltr">{user.email}</span></p>
          <label className="flex flex-row items-center gap-2 min-h-[44px] text-[14px] font-bold text-[#17324D]">
            <input
              type="checkbox"
              checked={consent.cloudBackup}
              onChange={(e) =>
                e.target.checked
                  ? run(async () => {
                      await api.setConsent({ ...consent, cloudBackup: true });
                      setConsentState({ ...consent, cloudBackup: true });
                      const b = await api.backupState();
                      if (b.decisionPending) {
                        setDecisionEpoch(b.epoch);
                        setDialog('reupload');
                      }
                    })
                  : setDialog('revoke')
              }
              className="w-5 h-5 accent-[#2AAE9B]"
            />
            גיבוי בענן של פעולות שאינן פרטיות
          </label>
          <p className="text-[11px] text-[#5C6F82]">שמירת הלשון, מודעות לדיבור, צדקה, מתנות לאביונים, ביקור חולים והרגל אישי לעולם לא נשלחים.</p>
          <div className="flex flex-col rounded-[14px] bg-[#F4F8FB] px-3 py-2 min-h-[44px] justify-center" role="status" data-testid="sync-status">
            <span className="text-[13px] font-bold text-[#17324D]">סנכרון: {STATUS_TEXT[status.state]}</span>
            {status.state === 'error' ? <span className="text-[12px] text-[#C95B53]">{ERROR_TEXT[status.code]} ממתינים: {status.pending}</span> : null}
            {status.state === 'ok' ? (
              <span className="text-[11px] text-[#5C6F82]">
                נשלחו {status.pushed}, התקבלו {status.pulled}, ממתינים {status.pending}
                {status.rejected ? `, ${status.rejected} נשארו במכשיר בלבד` : ''}
              </span>
            ) : null}
          </div>
          <button type="button" disabled={busy || status.state === 'syncing'} onClick={() => void sync()} className="min-h-[44px] rounded-[14px] border border-[#2AAE9B] text-[#1E8C7C] font-extrabold">סנכרון עכשיו</button>
          <button type="button" disabled={busy} onClick={() => run(async () => { const data = await api.exportServerData(); const { saveExport } = await import('../lib/exportData'); await saveExport(JSON.stringify(data, null, 2), 'mitzvot-plus-cloud-export.json'); })} className="min-h-[44px] rounded-[14px] border border-[#DDE8EE] text-[#17324D] font-bold">
            ייצוא המידע שבשרת
          </button>
          <button type="button" disabled={busy} onClick={() => setDialog('logout')} className="min-h-[44px] rounded-[14px] border border-[#DDE8EE] text-[#17324D] font-bold">התנתקות</button>
          <button type="button" disabled={busy} onClick={() => setDialog('logout-wipe')} className="min-h-[44px] rounded-[14px] border border-[#DDE8EE] text-[#17324D] font-bold">התנתקות ומחיקת נתוני החשבון מהמכשיר</button>
          <button type="button" disabled={busy} onClick={() => setDialog('delete')} className="min-h-[44px] rounded-[14px] text-[#C95B53] font-black">מחיקת החשבון</button>
        </div>
      )}
      {notice ? <p role="status" className="text-[12px] text-[#5C6F82]">{notice}</p> : null}
      {message ? <p role="alert" className="text-[12px] text-[#C95B53]">{message}</p> : null}

      <ConfirmDialog
        open={dialog === 'transfer'}
        title="להעביר את נתוני האורח לחשבון?"
        message={`במכשיר יש ${guestCount} רישומים שנעשו כאורח. אפשר להעביר אותם לחשבון, או להשאיר אותם כאורח ולהתחיל בחשבון נתונים נפרדים.`}
        confirmLabel="העברה לחשבון"
        cancelLabel="להשאיר כאורח"
        onConfirm={onConfirmOf(() => {
          if (pendingUser) void run(() => switchSpace(spaceOf(pendingUser), { transferFrom: GUEST }));
          setPendingUser(null);
        })}
        onClose={onCancelOf(() => {
          if (pendingUser) void run(() => switchSpace(spaceOf(pendingUser)));
          setPendingUser(null);
        })}
      />
      <ConfirmDialog
        open={dialog === 'revoke'}
        title="כיבוי הגיבוי"
        message="הסנכרון ייעצר מיד ולא יישלח עוד מידע. למחוק גם את מה שכבר גובה בשרת? הנתונים במכשיר נשארים."
        confirmLabel="כיבוי ומחיקה מהשרת"
        cancelLabel="כיבוי בלבד"
        destructive
        onConfirm={onConfirmOf(() => void run(async () => { cancelSync(); await api.setConsent({ ...consent, cloudBackup: false }, true); markCloudDeleted(); setConsentState({ ...consent, cloudBackup: false }); setStatus({ state: 'consent-needed' }); }))}
        onClose={onCancelOf(() => void run(async () => { cancelSync(); await api.setConsent({ ...consent, cloudBackup: false }); setConsentState({ ...consent, cloudBackup: false }); setStatus({ state: 'consent-needed' }); }))}
      />
      <ConfirmDialog
        open={dialog === 'reupload'}
        title="מה לגבות מעכשיו?"
        message="הגיבוי שבשרת נמחק קודם, בטלפון הזה או בטלפון אחר. אפשר לגבות שוב את כל מה שקיים בטלפונים (בלי מה שנמחק), או רק מה שיירשם מעכשיו. הבחירה חלה על כל הטלפונים בחשבון. עד שתבחרו, לא נשלח דבר."
        confirmLabel="כל ההיסטוריה"
        cancelLabel="רק מעכשיו"
        onConfirm={() => void decide(true)}
        onCancel={() => void decide(false)}
        // Closing without a choice decides nothing: the backup waits, and nothing is sent.
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'logout'}
        title="התנתקות"
        message="תחזרו לנתוני האורח. נתוני החשבון נשארים שמורים במכשיר, ויחזרו כשתתחברו שוב. הם לא יוצגו לאורח."
        confirmLabel="התנתקות"
        cancelLabel="ביטול"
        onConfirm={() => run(() => leave(false))}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'logout-wipe'}
        title="התנתקות ומחיקה מהמכשיר"
        message="נתוני החשבון יימחקו מהמכשיר הזה (למשל במכשיר משותף). מה שגובה בשרת נשאר. פעולות פרטיות שלא גובו יאבדו."
        confirmLabel="התנתקות ומחיקה"
        cancelLabel="ביטול"
        destructive
        onConfirm={() => run(() => leave(true))}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title="מחיקת החשבון"
        message="החשבון וכל המידע שבשרת יימחקו לצמיתות, וגם נתוני החשבון במכשיר הזה. מומלץ לייצא קודם. נתוני האורח לא נפגעים."
        confirmLabel="מחיקת החשבון"
        cancelLabel="ביטול"
        destructive
        onConfirm={() =>
          run(async () => {
            const mine = spaceOf(user!);
            cancelSync();
            await api.deleteAccount();
            setUser(null);
            setStatus({ state: 'signed-out' });
            await switchSpace(GUEST, { deleteSpace: mine });
          })
        }
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
