import React, { useState } from 'react';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { AppIcon } from './AppIcon';

/**
 * Shown whenever saving to the device failed. The app keeps retrying automatically;
 * the user can retry now. Nothing is presented as saved while this is visible.
 */
export function SaveStatusBanner() {
  const { saveStatus, retrySave } = useAppStore();
  const [busy, setBusy] = useState(false);
  if (saveStatus.state !== 'error' && !(busy && saveStatus.state === 'saving')) return null;

  const message =
    saveStatus.error === 'quota'
      ? 'אין מספיק מקום פנוי במכשיר, ולכן הפעולות האחרונות לא נשמרו. פנו מקום ונסו שוב.'
      : 'הפעולות האחרונות לא נשמרו במכשיר. ננסה שוב אוטומטית.';

  const retry = async () => {
    setBusy(true);
    await retrySave();
    setBusy(false);
  };

  return (
    <div
      role="alert"
      dir="rtl"
      className="sticky z-40 mx-4 mt-2 rounded-[18px] bg-[#FDEDEA] border border-[#F2C4BD] px-4 py-3 flex flex-row items-center gap-3"
      style={{ top: 'calc(0.5rem + var(--sat))' }}
    >
      <AppIcon name="shield" size={22} color={colors.danger} />
      <p className="flex-1 text-[#8A3A32] text-[13px] font-bold leading-5">{message}</p>
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="min-h-[44px] px-3 rounded-full bg-danger text-white text-[12px] font-extrabold shrink-0 disabled:opacity-60"
      >
        {busy ? 'שומר…' : 'נסו שוב'}
      </button>
    </div>
  );
}

/** Small label next to an action that is not stored yet (only while saving has failed). */
export function UnsavedMark({ logId }: { logId: string }) {
  const { saveStatus, isLogSaved } = useAppStore();
  if (saveStatus.state !== 'error' || isLogSaved(logId)) return null;
  return <span className="text-[#C95B53] text-[11px] font-black">לא נשמר</span>;
}
