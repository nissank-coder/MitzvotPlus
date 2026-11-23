import React from 'react';
import { formatClock, zmanimList } from '../lib/jewishCalendar';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { AppIcon } from './AppIcon';

const WEEKDAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function minutesUntil(target: Date, now: Date): string {
  const mins = Math.round((target.getTime() - now.getTime()) / 60_000);
  if (mins < 60) return `בעוד ${mins} דק׳`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `בעוד ${h} ש׳ ו-${m} דק׳` : `בעוד ${h} ש׳`;
}

/** Hebrew date, parsha, holidays and the next zman. */
export function TodayCard({ onOpenZmanim }: { onOpenZmanim: () => void }) {
  const { calendar } = useAppStore();
  const { day, zmanim, city, now } = calendar;
  const list = zmanimList(zmanim);
  if (day.isErevRest && zmanim.candleLighting) {
    list.push({ key: 'candle', label: 'הדלקת נרות', time: zmanim.candleLighting });
    list.sort((a, b) => a.time.getTime() - b.time.getTime());
  }
  const next = list.find((z) => z.time > now);
  const chips = [
    ...day.holidays.map((h) => h.title),
    ...(day.omerDay ? [`ספירת העומר: ${day.omerDay}`] : []),
  ];

  return (
    <div dir="rtl" className="rounded-[22px] bg-white border border-[#DDE8EE] card-shadow p-4 mb-3">
      <div className="flex flex-row items-start justify-between gap-3">
        <div className="flex flex-col items-start">
          <span className="text-[#718397] text-[12px] font-bold">יום {WEEKDAYS[day.weekday]}</span>
          <span className="text-[#17324D] text-[20px] font-black leading-tight">{day.hebrewDate}</span>
          {day.parsha ? <span className="text-[#1B6F8F] text-[12px] font-extrabold mt-0.5">{day.parsha}</span> : null}
        </div>
        {next ? (
          <button
            type="button"
            onClick={onOpenZmanim}
            className="flex flex-col items-end rounded-[16px] bg-[#EAF4FB] px-3 py-2 hover:bg-[#DDEEF8] transition-colors"
          >
            <span className="text-[#718397] text-[11px] font-bold flex flex-row items-center gap-1">
              <AppIcon name="clock" size={13} color={colors.primary} />
              {next.label}
            </span>
            <span className="text-[#17324D] text-[17px] font-black leading-tight">{formatClock(next.time, city)}</span>
            <span className="text-[#1B6F8F] text-[10px] font-bold">{minutesUntil(next.time, now)}</span>
          </button>
        ) : null}
      </div>
      {chips.length ? (
        <div className="flex flex-row flex-wrap gap-1.5 mt-3">
          {chips.map((c) => (
            <span key={c} className="px-2.5 py-1 rounded-full bg-[#FFF5DB] text-[#966500] text-[11px] font-black">
              {c}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
