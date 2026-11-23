import React, { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CitySilhouette, HillDecoration } from '../components/Decorations';
import { FeatureHeader } from '../components/FeatureHeader';
import { ProgressRing } from '../components/ProgressRing';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type Props = {
  onBack: () => void;
  onOpenProfile: () => void;
};

function durationParts(ms: number) {
  const safe = Math.max(0, ms);
  const days = Math.floor(safe / DAY_MS);
  const hours = Math.floor((safe % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((safe % HOUR_MS) / MINUTE_MS);
  return { days, hours, minutes };
}

export function LashonHaraScreen({ onBack, onOpenProfile }: Props) {
  const { state, resetSpeech } = useAppStore();
  const [now, setNow] = useState(Date.now());
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsed = Math.max(0, now - state.lashonHaraSince);
  const current = useMemo(() => durationParts(elapsed), [elapsed]);
  const best = useMemo(() => durationParts(state.lashonHaraBestMs), [state.lashonHaraBestMs]);
  const weeklyDays = Math.min(7, current.days);
  const weeklyProgress = weeklyDays / 7;

  return (
    <div className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-2">
      <AppHeader onProfilePress={onOpenProfile} />
      <FeatureHeader
        title="שמירת הלשון"
        subtitle="מתקדמים בלי שיפוטיות, יום אחרי יום"
        icon="chat"
        onBack={onBack}
      />

      <div className="relative min-h-[194px] rounded-[28px] overflow-hidden border border-[#D5E8EC] p-4 mb-4 bg-gradient-to-b from-[#F8FDFF] to-[#EAF7F4] card-shadow flex items-center">
        <CitySilhouette opacity={0.2} />
        <div className="relative z-10 w-full flex flex-row-reverse items-center gap-4">
          <ProgressRing progress={weeklyProgress} size={142} strokeWidth={12}>
            <AppIcon name="shield" size={25} color={colors.teal} />
            <span className="text-[#17324D] text-[17px] font-black mt-0.5">{current.days} ימים</span>
            <span dir="rtl" className="text-[#718397] text-[9px] font-bold mt-0.5">
              {current.hours} שעות · {current.minutes} דקות
            </span>
          </ProgressRing>
          <div className="flex-1 flex flex-col items-end">
            <div className="flex flex-row-reverse items-center gap-1">
              <span dir="rtl" className="text-[#1B6F8F] text-[13px] font-extrabold">
                מהפעם האחרונה
              </span>
              <AppIcon name="clock" size={18} color={colors.teal} />
            </div>
            <h2 dir="rtl" className="text-[#17324D] text-[26px] font-black mt-2 leading-tight">
              שמירת הלשון
            </h2>
            <p dir="rtl" className="text-[#718397] text-[13px] leading-5 mt-1 text-right">
              כל רגע של תשומת לב הוא הישג בפני עצמו
            </p>
            <div className="mt-3 px-2.5 py-[5px] rounded-full bg-[#EAF4FB] flex flex-row-reverse items-center gap-1">
              <AppIcon name="lock" size={14} color={colors.primary} />
              <span dir="rtl" className="text-[#1B6F8F] text-[10px] font-extrabold">
                פרטי ונשמר במכשיר בלבד
              </span>
            </div>
          </div>
        </div>
      </div>

      <Card className="min-h-[96px] p-4 flex flex-row items-center mb-4 !bg-[#E8F8F4]">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="w-[100px] flex flex-col items-center justify-center gap-1 bg-transparent border-0 p-1 rounded-xl hover:bg-white/50 transition-colors shrink-0"
        >
          <AppIcon name="reset" size={21} color={colors.primary} />
          <span dir="rtl" className="text-[#1B6F8F] text-[11px] font-black">
            התחלה חדשה
          </span>
        </button>
        <div className="w-px h-14 bg-[#CFE7E1] mx-3 shrink-0" />
        <div className="flex-1 flex flex-col items-end">
          <div className="flex flex-row-reverse items-center gap-2">
            <span dir="rtl" className="text-[#17324D] text-[17px] font-black">
              כל הכבוד!
            </span>
            <AppIcon name="trophy" size={22} color={colors.gold} />
          </div>
          <p dir="rtl" className="text-[#718397] text-[13px] mt-1 text-right">
            אתה בדרך לשמירה מודעת על הדיבור
          </p>
        </div>
      </Card>

      <div className="flex flex-row-reverse gap-2 mb-4">
        <StatCard
          icon="calendar"
          title="הרצף הנוכחי"
          value={`${current.days} ימים`}
          color={colors.green}
          background={colors.greenSoft}
        />
        <StatCard
          icon="chart"
          title="הממוצע"
          value="8 ימים"
          color={colors.primary}
          background={colors.blueSoft}
        />
        <StatCard
          icon="crown"
          title="השיא האישי"
          value={`${best.days} ימים`}
          color={colors.gold}
          background={colors.goldSoft}
        />
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-row-reverse items-center gap-2 mb-2">
          <h3 dir="rtl" className="text-[#17324D] text-[20px] font-black">
            טיפים לשמירת הלשון
          </h3>
          <AppIcon name="lightbulb" size={22} color={colors.gold} />
        </div>
        <TipRow
          icon="chat"
          color={colors.primary}
          background={colors.blueSoft}
          title="עוצרים רגע לפני שמדברים"
          text="שואלים: האם זה נכון, נחוץ ומיטיב?"
        />
        <TipRow
          icon="leaf"
          color={colors.green}
          background={colors.greenSoft}
          title="מכוונים את השיחה לטוב"
          text="מעבירים את המיקוד לנושא מועיל או למילה טובה."
        />
        <TipRow
          icon="heart"
          color={colors.coral}
          background={colors.coralSoft}
          title="מדברים על האדם כפי שהיינו רוצים"
          text="חושבים איך היינו מרגישים אילו הדברים נאמרו עלינו."
          last
        />
      </Card>

      <Card className="min-h-[138px] p-4 flex flex-row items-center gap-3 overflow-hidden">
        <HillDecoration />
        <div className="flex-1 flex flex-col items-end">
          <div className="flex flex-row-reverse items-center gap-2">
            <span dir="rtl" className="text-[#17324D] text-[17px] font-black">
              האתגר השבועי
            </span>
            <AppIcon name="target" size={21} color={colors.teal} />
          </div>
          <span dir="rtl" className="text-[#718397] text-[13px] mt-1">
            7 ימים של תשומת לב לדיבור
          </span>
          <div className="w-full h-2 rounded-full bg-[#EAF0F4] mt-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#2AAE9B] transition-all duration-300"
              style={{ width: `${weeklyProgress * 100}%` }}
            />
          </div>
          <span className="text-[#2AAE9B] text-[11px] font-black mt-1">{weeklyDays}/7 ימים</span>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="התחלה חדשה"
        message="לעדכן שהייתה מעידה ולהתחיל את הספירה מחדש? הנתון נשמר רק במכשיר שלך."
        confirmLabel="התחלה מחדש"
        cancelLabel="ביטול"
        destructive
        onConfirm={resetSpeech}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
  color,
  background,
}: {
  icon: 'calendar' | 'chart' | 'crown';
  title: string;
  value: string;
  color: string;
  background: string;
}) {
  return (
    <div
      className="flex-1 min-h-[118px] rounded-[22px] flex flex-col items-center justify-center p-2 border border-[#DDE8EE]"
      style={{ backgroundColor: background }}
    >
      <AppIcon name={icon} size={22} color={color} />
      <span dir="rtl" className="text-[#718397] text-[10px] font-bold mt-2 text-center">
        {title}
      </span>
      <span className="text-[#17324D] text-[13px] font-black mt-1 text-center">{value}</span>
    </div>
  );
}

function TipRow({
  icon,
  color,
  background,
  title,
  text,
  last = false,
}: {
  icon: 'chat' | 'leaf' | 'heart';
  color: string;
  background: string;
  title: string;
  text: string;
  last?: boolean;
}) {
  return (
    <div
      className={`min-h-[84px] flex flex-row-reverse items-center gap-3 py-3 ${
        !last ? 'border-b border-[#EAF0F4]' : ''
      }`}
    >
      <div className="flex-1 flex flex-col items-end">
        <span dir="rtl" className="text-[#17324D] text-[15px] font-black text-right">
          {title}
        </span>
        <p dir="rtl" className="text-[#718397] text-[13px] leading-5 mt-1 text-right">
          {text}
        </p>
      </div>
      <div
        className="w-11 h-11 rounded-[16px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: background }}
      >
        <AppIcon name={icon} size={21} color={color} />
      </div>
    </div>
  );
}
