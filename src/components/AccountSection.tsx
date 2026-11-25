import React, { useCallback, useEffect, useState } from 'react';
import { accountApi, AccountApi, AccountUser, Consent } from '../backend/account';
import { supabaseClient } from '../backend/supabase';
import { BACKEND } from '../backend/config';
import { useAppStore } from '../store/AppStore';
import type { SyncStatus } from '../sync/engine';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * "חשבון וסנכרון" (round 12) – development / staging builds only (BACKEND_ENABLED); lazy-loaded so
 * production bundles contain none of it. Guest by default; sign-in with an e-mail one-time code.
 * Backup is OFF until the user turns it on; private actions never leave the device.
 */
const STATUS_TEXT: Record<SyncStatus['state'], string> = {
  off: 'כבוי',
  'signed-out': 'לא מחובר',
  'consent-needed': 'גיבוי כבוי – לא נשלח דבר',
  syncing: 'מסנכרן…',
  ok: 'מסונכרן',
  error: 'שגיאה – ננסה שוב',
  'account-deleted': 'החשבון נמחק',
};

export default function AccountSection() {
  const { runSync } = useAppStore();
  const [api, setApi] = useState<AccountApi | null>(null);
  const [user, setUser] = useState<AccountUser | null>(null);
  const [consent, setConsentState] = useState<Consent>({ cloudBackup: false, social: false });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [status, setStatus] = useState<SyncStatus>({ state: 'signed-out' });
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'delete' | 'logout' | 'revoke' | null>(null);

  useEffect(() => {
    supabaseClient().then(async (sb) => {
      const a = accountApi(sb);
      setApi(a);
      const u = await a.currentUser();
      setUser(u);
      if (u) setConsentState(await a.consent().catch(() => ({ cloudBackup: false, social: false })));
    });
  }, []);

  const sync = useCallback(async () => {
    if (!api || !user) return;
    setStatus({ state: 'syncing' });
    const s = await runSync(api.remote(), consent.cloudBackup);
    setStatus(s);
    if (s.state === 'account-deleted') setUser(null);
  }, [api, user, consent.cloudBackup, runSync]);

  const run = async (fn: () => Promise<void>) => {
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  if (!api) return <p className="text-[13px] text-[#5C6F82]">טוען חשבון…</p>;

  return (
    <div dir="rtl" className="flex flex-col gap-3" data-testid="account-section">
      <p className="text-[11px] text-[#8A5A00] bg-[#FFF5DB] rounded px-2 py-1 self-start">שרת {BACKEND.env === 'staging' ? 'בדיקות (staging)' : 'פיתוח'} – לא ייצור</p>
      {!user ? (
        step === 'email' ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] text-[#5C6F82]">אפשר להמשיך כאורח. חשבון מאפשר גיבוי והחלפת מכשיר – ההיסטוריה שבמכשיר נשמרת.</p>
            <label className="text-[13px] font-bold text-[#17324D]" htmlFor="acct-email">דוא״ל</label>
            <input id="acct-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} className="min-h-[48px] rounded-[14px] border border-[#DDE8EE] px-3" />
            <button type="button" disabled={!/^\S+@\S+\.\S+$/.test(email)} onClick={() => run(async () => { await api.requestCode(email); setStep('code'); })} className="min-h-[48px] rounded-[14px] bg-[#2AAE9B] disabled:bg-[#A7B4C0] text-white font-extrabold">
              שליחת קוד התחברות
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-bold text-[#17324D]" htmlFor="acct-code">הקוד שנשלח ל-{email}</label>
            <input id="acct-code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} className="min-h-[48px] rounded-[14px] border border-[#DDE8EE] px-3 tracking-widest" />
            <button type="button" onClick={() => run(async () => { const u = await api.verifyCode(email, code); setUser(u); setConsentState(await api.consent()); setStep('email'); setCode(''); })} className="min-h-[48px] rounded-[14px] bg-[#2AAE9B] text-white font-extrabold">
              התחברות
            </button>
            <button type="button" onClick={() => setStep('email')} className="min-h-[40px] text-[13px] text-[#5C6F82]">חזרה</button>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[14px] text-[#17324D]">מחובר: <span dir="ltr">{user.email}</span></p>
          <label className="flex flex-row items-center gap-2 min-h-[44px] text-[14px] font-bold text-[#17324D]">
            <input
              type="checkbox"
              checked={consent.cloudBackup}
              onChange={(e) => (e.target.checked ? run(async () => { await api.setConsent({ ...consent, cloudBackup: true }); setConsentState({ ...consent, cloudBackup: true }); }) : setConfirm('revoke'))}
              className="w-5 h-5 accent-[#2AAE9B]"
            />
            גיבוי בענן של פעולות שאינן פרטיות
          </label>
          <p className="text-[11px] text-[#5C6F82]">שמירת הלשון, מודעות לדיבור, צדקה, מתנות לאביונים, ביקור חולים והרגל אישי לעולם לא נשלחים.</p>
          <div className="flex flex-row items-center justify-between rounded-[14px] bg-[#F4F8FB] px-3 min-h-[44px]" role="status">
            <span className="text-[13px] font-bold text-[#17324D]">סנכרון: {STATUS_TEXT[status.state]}</span>
            {status.state === 'ok' || status.state === 'error' ? <span className="text-[11px] text-[#5C6F82]">ממתינים: {status.pending}</span> : null}
          </div>
          <button type="button" onClick={() => void sync()} className="min-h-[44px] rounded-[14px] border border-[#2AAE9B] text-[#1E8C7C] font-extrabold">סנכרון עכשיו</button>
          <button type="button" onClick={() => run(async () => { const data = await api.exportServerData(); const { saveExport } = await import('../lib/exportData'); await saveExport(JSON.stringify(data, null, 2), 'mitzvot-plus-cloud-export.json'); })} className="min-h-[44px] rounded-[14px] border border-[#DDE8EE] text-[#17324D] font-bold">
            ייצוא המידע שבשרת
          </button>
          <button type="button" onClick={() => setConfirm('logout')} className="min-h-[44px] rounded-[14px] border border-[#DDE8EE] text-[#17324D] font-bold">התנתקות</button>
          <button type="button" onClick={() => setConfirm('delete')} className="min-h-[44px] rounded-[14px] text-[#C95B53] font-black">מחיקת החשבון</button>
        </div>
      )}
      {message ? <p role="alert" className="text-[12px] text-[#C95B53]">{message}</p> : null}
      <ConfirmDialog
        open={confirm === 'revoke'}
        title="כיבוי הגיבוי"
        message="לא יישלח עוד מידע. למחוק גם את מה שכבר גובה בשרת? (הנתונים במכשיר נשארים)"
        confirmLabel="כיבוי ומחיקה מהשרת"
        cancelLabel="ביטול"
        onConfirm={() => run(async () => { await api.setConsent({ ...consent, cloudBackup: false }, true); setConsentState({ ...consent, cloudBackup: false }); })}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'logout'}
        title="התנתקות"
        message="הנתונים נשארים במכשיר כאורח. במכשיר משותף אפשר למחוק אותם במסך זה (מחיקת כל הנתונים)."
        confirmLabel="התנתקות"
        cancelLabel="ביטול"
        onConfirm={() => run(async () => { await api.signOut(); setUser(null); setStatus({ state: 'signed-out' }); })}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="מחיקת החשבון"
        message="החשבון וכל המידע שבשרת יימחקו לצמיתות. הנתונים במכשיר יישארו כאורח, אלא אם תמחקו גם אותם."
        confirmLabel="מחיקת החשבון"
        cancelLabel="ביטול"
        destructive
        onConfirm={() => run(async () => { await api.deleteAccount(); setUser(null); setStatus({ state: 'account-deleted' }); })}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
