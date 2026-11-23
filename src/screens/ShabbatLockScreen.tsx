import React from 'react';
import { AppIcon } from '../components/AppIcon';
import { formatClock } from '../lib/jewishCalendar';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

/** Shown from candle lighting until tzeit – the app is closed for logging on Shabbat and Yom Tov. */
export function ShabbatLockScreen() {
  const { calendar } = useAppStore();
  const { rest, city } = calendar;
  const isShabbat = rest.title === 'שבת';

  return (
    <div dir="rtl" className="min-h-dvh max-w-[460px] mx-auto flex flex-col items-center justify-center bg-[#17324D] px-6 text-center relative overflow-hidden">
      <div className="relative z-10 flex flex-col items-center">
        <div className="flex flex-row gap-3 mb-6">
          <AppIcon name="flame" size={40} color={colors.gold} />
          <AppIcon name="flame" size={40} color={colors.gold} />
        </div>
        <h1 className="text-white text-[34px] font-black leading-tight">
          {isShabbat ? 'שבת שלום' : `${rest.title} – חג שמח`}
        </h1>
        <p className="text-[#BDECE3] text-[15px] mt-3 leading-6 max-w-[300px]">
          {isShabbat ? 'האפליקציה נחה בשבת.' : 'האפליקציה נחה ביום טוב.'} אחרי {isShabbat ? 'ההבדלה' : 'צאת החג'} אפשר יהיה לרשום
          את כל המצוות שעשית.
        </p>
        {rest.endsAt ? (
          <div className="mt-8 px-5 py-3 rounded-[22px] bg-white/10 border border-white/15">
            <span className="text-[#BDECE3] text-[12px] font-bold block">יציאה ב{city.name}</span>
            <span className="text-white text-[28px] font-black">{formatClock(rest.endsAt, city)}</span>
          </div>
        ) : null}
        <p className="text-white/60 text-[11px] mt-10 max-w-[280px] leading-5">
          מומלץ לסגור את המכשיר לפני כניסת {isShabbat ? 'השבת' : 'החג'}.
        </p>
      </div>
    </div>
  );
}
