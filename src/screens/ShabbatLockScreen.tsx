import React, { useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatClock } from '../lib/jewishCalendar';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

/**
 * Shown from candle lighting until tzeit: recording mitzvot is closed on Shabbat and Yom Tov.
 * Privacy information and data deletion stay reachable during the lock (spec §4).
 * The same screen is shown to every user – there is no hidden bypass.
 */
export function ShabbatLockScreen() {
  const { calendar, resetAll } = useAppStore();
  const { rest, city } = calendar;
  const isShabbat = rest.title === 'שבת';
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div dir="rtl" className="min-h-dvh max-w-[460px] mx-auto flex flex-col items-center justify-center bg-[#17324D] px-6 text-center">
      <div className="flex flex-row gap-3 mb-6" aria-hidden="true">
        <AppIcon name="flame" size={40} color={colors.gold} />
        <AppIcon name="flame" size={40} color={colors.gold} />
      </div>
      <h1 className="text-white text-[34px] font-black leading-tight">{isShabbat ? 'שבת שלום' : `${rest.title} – חג שמח`}</h1>
      <p className="text-[#BDECE3] text-[15px] mt-3 leading-6 max-w-[300px]">
        {isShabbat ? 'רישום מצוות סגור בשבת.' : 'רישום מצוות סגור ביום טוב.'} אחרי {isShabbat ? 'ההבדלה' : 'צאת החג'} אפשר יהיה לרשום את
        מה שעשית.
      </p>

      <div className="mt-8 px-5 py-3 rounded-[22px] bg-white/10 border border-white/15">
        <span className="text-[#BDECE3] text-[12px] font-bold block">הרישום נפתח ב{city.name}</span>
        {rest.endsAt ? (
          <span className="text-white text-[28px] font-black">{formatClock(rest.endsAt, city)}</span>
        ) : (
          <span className="text-white text-[15px] font-bold block mt-1 max-w-[240px]">
            לא ניתן לחשב את שעת היציאה לעיר זו. הרישום ייפתח בתחילת היום האזרחי הבא.
          </span>
        )}
      </div>

      <p className="text-white/60 text-[11px] mt-8 max-w-[280px] leading-5">
        השעות מחושבות לפי כללי טיוטה שטרם אושרו על ידי רב. מומלץ לסגור את המכשיר לפני כניסת {isShabbat ? 'השבת' : 'החג'}.
      </p>

      <button
        type="button"
        onClick={() => setPrivacyOpen((v) => !v)}
        aria-expanded={privacyOpen}
        className="mt-6 min-h-[44px] px-4 rounded-full border border-white/25 text-white text-[13px] font-bold hover:bg-white/10"
      >
        פרטיות ומחיקת נתונים
      </button>
      {privacyOpen ? (
        <div className="mt-4 w-full max-w-[340px] rounded-[18px] bg-white/10 border border-white/15 p-4 text-right">
          <p className="text-white text-[13px] leading-6">
            כל הנתונים נשמרים במכשיר בלבד ואינם נשלחים לשרת. אפשר למחוק אותם בכל זמן, גם עכשיו.
          </p>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-3 min-h-[44px] w-full rounded-full bg-[#C95B53] text-white text-[13px] font-black"
          >
            מחיקת כל הנתונים מהמכשיר
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        title="מחיקת כל הנתונים"
        message="כל ההיסטוריה, הנקודות וההגדרות יימחקו מהמכשיר. לא ניתן לשחזר."
        confirmLabel="מחיקה"
        cancelLabel="ביטול"
        destructive
        onConfirm={resetAll}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
