import React from 'react';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ProgressRing } from '../components/ProgressRing';
import { SectionHeader } from '../components/SectionHeader';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { IconName } from '../types';

type Props = {
  onOpenProfile: () => void;
  onOpenBlessings: () => void;
  onOpenTorah: () => void;
};

const week = [
  { day: 'א׳', value: 7 },
  { day: 'ב׳', value: 10 },
  { day: 'ג׳', value: 8 },
  { day: 'ד׳', value: 12 },
  { day: 'ה׳', value: 9 },
  { day: 'ו׳', value: 6 },
  { day: 'ש׳', value: 4 },
];

export function GoalsScreen({ onOpenProfile, onOpenBlessings, onOpenTorah }: Props) {
  const { state, blessingTotal } = useAppStore();
  const dailyProgress = Math.min(1, state.dailyLogs.length / state.dailyGoal);
  const weeklyProgress = Math.min(1, state.weeklyProgress / state.weeklyGoal);

  return (
    <div className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-2">
      <AppHeader onProfilePress={onOpenProfile} />

      <div className="flex flex-row-reverse items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-[16px] bg-[#EAF4FB] flex items-center justify-center shrink-0">
          <AppIcon name="target" size={23} color={colors.primary} />
        </div>
        <div className="flex-1 flex flex-col items-end">
          <h1 dir="rtl" className="text-[#17324D] text-[24px] font-black leading-tight">
            התקדמות ויעדים
          </h1>
          <p dir="rtl" className="text-[#718397] text-[13px] mt-1">
            התמונה הגדולה של המסע שלך
          </p>
        </div>
      </div>

      <Card className="min-h-[160px] p-5 flex flex-row items-center gap-4 mb-4 overflow-hidden">
        <div className="w-[72px] h-[72px] rounded-full bg-[#FFF5DB] flex items-center justify-center shrink-0">
          <AppIcon name="crown" size={36} color={colors.gold} />
        </div>
        <div className="flex-1 flex flex-col items-end">
          <span dir="rtl" className="text-[#718397] text-[13px] font-bold">
            הניקוד הכולל
          </span>
          <span className="text-[#17324D] text-[34px] font-black mt-0.5 leading-tight">
            {state.points.toLocaleString('he-IL')}
          </span>
          <span dir="rtl" className="text-[#718397] text-[11px] mt-1">
            עוד 270 נקודות לדרגה הבאה
          </span>
          <div className="w-full h-[7px] rounded-full bg-[#EAF0F4] mt-3 overflow-hidden">
            <div className="h-full rounded-full bg-[#2AAE9B]" style={{ width: '73%' }} />
          </div>
        </div>
        <div className="w-[60px] h-[60px] rounded-full bg-[#EAF4FB] flex flex-col items-center justify-center shrink-0">
          <span className="text-[#1B6F8F] text-[22px] font-black leading-none">7</span>
          <span className="text-[#1B6F8F] text-[9px] font-extrabold mt-0.5">דרגה</span>
        </div>
      </Card>

      <div className="flex flex-row-reverse gap-2 mb-4">
        <SummaryCard
          title="יעד יומי"
          value={`${state.dailyLogs.length}/${state.dailyGoal}`}
          progress={dailyProgress}
          icon="target"
          color={colors.teal}
        />
        <SummaryCard
          title="100 ברכות"
          value={`${blessingTotal}/100`}
          progress={blessingTotal / 100}
          icon="star"
          color={colors.primary}
          onPress={onOpenBlessings}
        />
        <SummaryCard
          title="רצף לימוד"
          value={`${state.torahStreak} ימים`}
          progress={Math.min(1, state.torahStreak / 30)}
          icon="flame"
          color={colors.coral}
          onPress={onOpenTorah}
        />
      </div>

      <Card className="p-4 mb-5">
        <SectionHeader
          title="השבוע שלי"
          icon="chart"
          actionLabel={`${state.weeklyProgress}/${state.weeklyGoal}`}
        />
        <div className="h-[180px] flex flex-row-reverse items-end justify-between pt-3">
          {week.map((item) => (
            <div key={item.day} className="flex-1 h-full flex flex-col items-center justify-end">
              <span className="text-[#718397] text-[10px] font-bold mb-1">{item.value}</span>
              <div className="w-5 h-[125px] rounded-full bg-[#EAF4FB] overflow-hidden flex items-end">
                <div
                  className="w-full rounded-full bg-[#2AAE9B]"
                  style={{ height: `${Math.max(18, (item.value / 12) * 100)}%` }}
                />
              </div>
              <span className="text-[#17324D] text-[13px] font-extrabold mt-2">{item.day}</span>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <p dir="rtl" className="text-[#718397] text-[13px] text-right">
            השלמת {Math.round(weeklyProgress * 100)}% מהיעד השבועי
          </p>
          <div className="w-full h-2 rounded-full bg-[#EAF0F4] overflow-hidden mt-2">
            <div
              className="h-full rounded-full bg-[#1B6F8F] transition-all duration-300"
              style={{ width: `${weeklyProgress * 100}%` }}
            />
          </div>
        </div>
      </Card>

      <SectionHeader title="הישגים" icon="trophy" />
      <div className="flex flex-col gap-3">
        <Badge title="מתמיד" subtitle="14 ימי לימוד" icon="flame" color={colors.coral} background={colors.coralSoft} />
        <Badge title="לב פתוח" subtitle="20 מעשי חסד" icon="heart" color={colors.green} background={colors.greenSoft} />
        <Badge title="מברך" subtitle="500 ברכות" icon="star" color={colors.gold} background={colors.goldSoft} />
        <Badge title="בן תורה" subtitle="30 דברי תורה" icon="book" color={colors.purple} background={colors.purpleSoft} />
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  progress,
  icon,
  color,
  onPress,
}: {
  title: string;
  value: string;
  progress: number;
  icon: IconName;
  color: string;
  onPress?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!onPress}
      className={`flex-1 min-h-[142px] rounded-[22px] bg-white border border-[#DDE8EE] flex flex-col items-center justify-center p-2 card-shadow transition-colors ${
        onPress ? 'hover:border-[#2AAE9B]' : 'cursor-default'
      }`}
    >
      <ProgressRing progress={progress} size={72} strokeWidth={7} color={color}>
        <AppIcon name={icon} size={18} color={color} />
      </ProgressRing>
      <span className="text-[#17324D] text-[13px] font-black mt-2 text-center">{value}</span>
      <span dir="rtl" className="text-[#718397] text-[10px] font-bold mt-0.5 text-center">
        {title}
      </span>
    </button>
  );
}

function Badge({
  title,
  subtitle,
  icon,
  color,
  background,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
  background: string;
}) {
  return (
    <div className="min-h-[78px] rounded-[22px] bg-white border border-[#DDE8EE] p-3 flex flex-row-reverse items-center gap-3">
      <div
        className="w-[46px] h-[46px] rounded-[16px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: background }}
      >
        <AppIcon name={icon} size={25} color={color} />
      </div>
      <div className="flex-1 flex flex-col items-end">
        <span dir="rtl" className="text-[#17324D] text-[15px] font-black">
          {title}
        </span>
        <span dir="rtl" className="text-[#718397] text-[11px] mt-1">
          {subtitle}
        </span>
      </div>
      <AppIcon name="check" size={19} color={colors.green} />
    </div>
  );
}
