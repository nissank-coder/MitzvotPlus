import React, { useState } from 'react';
import { shortcuts } from '../data';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { FeatureKey } from '../types';
import { AppHeader } from '../components/AppHeader';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatTime } from '../lib/dates';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { CitySilhouette, HillDecoration } from '../components/Decorations';
import { ProgressRing } from '../components/ProgressRing';
import { SectionHeader } from '../components/SectionHeader';
import { TodayCard } from '../components/TodayCard';
import { TodayPlanCard } from '../components/TodayPlanCard';
import { BackfillSheet } from '../components/BackfillSheet';

type Props = {
  onOpenFeature: (feature: Exclude<FeatureKey, null>) => void;
  onOpenProfile: () => void;
  onOpenCommunity: () => void;
  onQuickAdd: () => void;
};

export function HomeScreen({ onOpenFeature, onOpenProfile, onOpenCommunity, onQuickAdd }: Props) {
  const { state, derived, calendar, removeLog } = useAppStore();
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const [backfillOpen, setBackfillOpen] = useState(false);
  const pending = calendar.pendingBackfill;
  const todayCount = derived.todayCount;
  const dailyProgress = Math.min(1, todayCount / state.dailyGoal);
  const weeklyProgress = Math.min(1, derived.week.total / state.weeklyGoal);
  const latestLogs = derived.todayLogs.slice(0, 4);

  const handleShortcut = (key: (typeof shortcuts)[number]['key']) => onOpenFeature(key);

  return (
    <div className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-2">
      <AppHeader onProfilePress={onOpenProfile} />

      {pending.length > 0 ? (
        <button
          type="button"
          onClick={() => setBackfillOpen(true)}
          dir="rtl"
          className="w-full mb-3 rounded-[22px] bg-[#17324D] text-white p-4 flex flex-row items-center gap-3 text-right hover:opacity-95"
        >
          <AppIcon name="flame" size={26} color={colors.gold} />
          <span className="flex-1 flex flex-col">
            <span className="text-[16px] font-black">שבוע טוב! מה עשית {calendar.day.isRestDay ? '' : 'ב'}{pending.length > 1 ? 'חג' : 'שבת'}?</span>
            <span className="text-[12px] text-[#BDECE3] mt-0.5">רישום קידוש, סעודות, תפילות והבדלה – בדיעבד</span>
          </span>
          <AppIcon name="chevronLeft" size={20} color={colors.white} />
        </button>
      ) : null}

      <TodayCard onOpenZmanim={() => onOpenFeature('prayers')} />

      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpenFeature('goals')}
        onKeyDown={(e) => (e.key === 'Enter' ? onOpenFeature('goals') : undefined)}
        aria-label="התקדמות ויעדים"
        className="relative min-h-[178px] rounded-[28px] overflow-hidden border border-[#D5E8EC] p-4 mb-3 bg-gradient-to-b from-[#F7FCFF] to-[#E7F5F5] card-shadow flex items-center cursor-pointer"
      >
        <CitySilhouette opacity={0.23} />
        <div className="relative z-10 w-full flex flex-row-reverse items-center justify-between gap-4">
          <ProgressRing progress={dailyProgress} size={124} strokeWidth={12}>
            <AppIcon name="scroll" size={25} color={colors.teal} />
            <span className="text-[#17324D] text-[17px] font-black mt-0.5">
              {todayCount}/{state.dailyGoal}
            </span>
          </ProgressRing>
          <div className="flex-1 flex flex-col items-end">
            <div className="flex flex-row-reverse items-center gap-1">
              <span dir="rtl" className="text-[#1B6F8F] text-[13px] font-extrabold">
                היעד היומי
              </span>
              <AppIcon name="target" size={18} color={colors.teal} />
            </div>
            <h1 dir="rtl" className="text-[#17324D] text-[23px] leading-[29px] font-black text-right mt-2">
              {todayCount} מתוך {state.dailyGoal} מצוות
            </h1>
            <p dir="rtl" className="text-[#718397] text-[13px] text-right mt-1">
              {todayCount >= state.dailyGoal
                ? 'היעד הושלם. ממשיכים מתוך שמחה'
                : `עוד ${state.dailyGoal - todayCount} מצוות להשלמת היעד`}
            </p>
            <div className="w-full h-[7px] rounded-full bg-[#D8E8EB] mt-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#2AAE9B] transition-all duration-300"
                style={{ width: `${dailyProgress * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-row-reverse gap-2 mb-5">
        <MetricChip icon="coin" label="ניקוד" value={derived.totalPoints.toLocaleString('he-IL')} color={colors.gold} />
        <MetricChip icon="flame" label="רצף" value={`${derived.activityStreak} ימים`} color={colors.coral} />
        <MetricChip icon="star" label="ברכות" value={`${derived.blessingTotal}/${state.blessingGoal}`} color={colors.teal} />
      </div>

      <TodayPlanCard />

      <SectionHeader title="קיצורי דרך" icon="plus" />
      <div className="flex flex-row gap-3 overflow-x-auto no-scrollbar pb-5">
        {[...shortcuts].reverse().map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => handleShortcut(item.key)}
            className="w-[92px] min-w-[92px] min-h-[102px] rounded-[22px] bg-white border border-[#DDE8EE] flex flex-col items-center justify-center p-2 hover:border-[#2AAE9B] transition-colors shrink-0"
          >
            <div
              className="w-12 h-12 rounded-[16px] flex items-center justify-center mb-2"
              style={{ backgroundColor: item.background }}
            >
              <AppIcon name={item.icon} size={25} color={item.color} />
            </div>
            <span dir="rtl" className="text-[#17324D] text-[13px] font-extrabold text-center">
              {item.title}
            </span>
          </button>
        ))}
      </div>

      <Card className="p-4 mb-4">
        <SectionHeader title="היום שלי" icon="calendar" actionLabel="הוספה" onAction={onQuickAdd} />
        {latestLogs.length === 0 ? (
          <div className="flex flex-col items-center py-5">
            <AppIcon name="leaf" size={34} color={colors.teal} />
            <span className="mt-2 text-[#17324D] text-[17px] font-black">היום מתחיל עכשיו</span>
            <span dir="rtl" className="mt-1 text-[#718397] text-[13px] text-center">
              הוסיפו את המצווה הראשונה שלכם להיום
            </span>
          </div>
        ) : (
          latestLogs.map((item, index) => (
            <div
              key={item.id}
              className={`min-h-[58px] flex flex-row items-center justify-between py-2 ${
                index < latestLogs.length - 1 ? 'border-b border-[#EAF0F4]' : ''
              }`}
            >
              <div className="flex flex-row items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPendingRemove({ id: item.id, title: item.title })}
                  aria-label={`ביטול הרישום: ${item.title}`}
                  className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-[#FDECEC] transition-colors"
                >
                  <AppIcon name="close" size={15} color={colors.textMuted} />
                </button>
                <AppIcon name="check" size={20} color={colors.green} />
                <span className="text-[#718397] text-[13px] font-bold">{formatTime(item.createdAt)}</span>
              </div>
              <div className="flex-1 flex flex-row-reverse items-center justify-start gap-3">
                <span dir="rtl" className="text-[#17324D] text-[15px] font-extrabold text-right">
                  {item.title}
                </span>
                <div className="w-[38px] h-[38px] rounded-[16px] bg-[#EAF4FB] flex items-center justify-center shrink-0">
                  <AppIcon name={item.icon} size={19} color={colors.primary} />
                </div>
              </div>
            </div>
          ))
        )}
      </Card>

      <button
        type="button"
        onClick={onOpenCommunity}
        className="w-full text-left bg-transparent border-0 p-0 mb-4 block"
      >
        <Card className="min-h-[132px] p-4 flex flex-row items-center gap-3 overflow-hidden hover:border-[#2AAE9B] transition-colors">
          <HillDecoration />
          <div className="flex-1 flex flex-col items-end">
            <div className="flex flex-row-reverse items-center gap-2">
              <span dir="rtl" className="text-[#17324D] text-[17px] font-black">
                האתגר השבועי
              </span>
              <AppIcon name="trophy" size={21} color={colors.gold} />
            </div>
            <span dir="rtl" className="text-[#718397] text-[13px] font-bold mt-1">
              {derived.week.total} מתוך {state.weeklyGoal} מצוות
            </span>
            <div className="w-full h-2 rounded-full bg-[#EAF0F4] mt-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#2AAE9B] transition-all duration-300"
                style={{ width: `${weeklyProgress * 100}%` }}
              />
            </div>
            <span dir="rtl" className="text-[#718397] text-[11px] mt-2">
              כל מצווה שלך מקדמת גם את הקהילה
            </span>
          </div>
        </Card>
      </button>

      <Card className="min-h-[148px] p-4 flex flex-row items-center gap-4">
        <div className="relative w-[112px] h-[92px] flex justify-end items-center shrink-0">
          <div className="absolute w-[80px] h-[72px] rounded-[6px] bg-[#274C67] -rotate-7 bottom-[2px] left-[12px]" />
          <div className="absolute w-[86px] h-[68px] rounded-[6px] bg-[#3B6A83] rotate-4 bottom-[4px] left-[17px]" />
          <div className="relative z-10 w-[78px] h-[64px] rounded-[6px] bg-[#17324D] border-2 border-[#F4B942] mx-auto mt-auto" />
        </div>
        <div className="flex-1 flex flex-col items-end">
          <div className="flex flex-row-reverse items-center gap-2">
            <span dir="rtl" className="text-[#17324D] text-[17px] font-black">
              הטבת השבוע
            </span>
            <AppIcon name="gift" size={21} color={colors.teal} />
          </div>
          <p dir="rtl" className="mt-2 text-[#718397] text-[13px] leading-5 text-right">
            ספר מבחר דברי תורה בהנחה מיוחדת לחברי מצוות+
          </p>
          <div className="flex flex-row-reverse items-center gap-1 mt-3 px-2 py-[5px] rounded-full bg-[#FFF5DB]">
            <AppIcon name="coin" size={15} color={colors.gold} />
            <span className="text-[#966500] text-[11px] font-black">2,000 נקודות</span>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="ביטול רישום"
        message={pendingRemove ? `להסיר את "${pendingRemove.title}" מהיומן של היום? הנקודות יופחתו.` : ''}
        confirmLabel="הסרה"
        cancelLabel="ביטול"
        destructive
        onConfirm={() => pendingRemove && removeLog(pendingRemove.id)}
        onClose={() => setPendingRemove(null)}
      />

      {backfillOpen ? <BackfillSheet days={pending} onClose={() => setBackfillOpen(false)} /> : null}
    </div>
  );
}

function MetricChip({
  icon,
  label,
  value,
  color,
}: {
  icon: 'coin' | 'flame' | 'star';
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex-1 min-h-[72px] bg-white rounded-[22px] border border-[#DDE8EE] px-2 py-3 flex flex-row-reverse items-center justify-center gap-2">
      <div
        className="w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}1F` }}
      >
        <AppIcon name={icon} size={18} color={color} />
      </div>
      <div className="flex flex-col items-end">
        <span className="text-[#17324D] text-[13px] font-black leading-tight">{value}</span>
        <span className="text-[#718397] text-[11px] mt-0.5 leading-tight">{label}</span>
      </div>
    </div>
  );
}
