import React from 'react';
import { AppHeader } from '../components/AppHeader';
import { FeatureHeader } from '../components/FeatureHeader';
import { SYNC_ENABLED } from '../config/features';
import { DVAR_TORAH_AVAILABLE } from '../content/registry';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ProgressRing } from '../components/ProgressRing';
import { SectionHeader } from '../components/SectionHeader';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { IconName } from '../types';
import { BadgeKey } from '../lib/progress';

type Props = {
  onBack: () => void;
  onOpenProfile: () => void;
  onOpenBlessings: () => void;
  onOpenTorah: () => void;
};

const badgeStyle: Record<BadgeKey, { icon: IconName; color: string; background: string }> = {
  steady: { icon: 'flame', color: colors.coral, background: colors.coralSoft },
  kindness: { icon: 'heart', color: colors.green, background: colors.greenSoft },
  blesser: { icon: 'star', color: colors.gold, background: colors.goldSoft },
  torah: { icon: 'book', color: colors.purple, background: colors.purpleSoft },
};

export function GoalsScreen({ onBack, onOpenProfile, onOpenBlessings, onOpenTorah }: Props) {
  const { state, derived } = useAppStore();
  const { level, week, blessingTotal } = derived;
  const dailyProgress = Math.min(1, derived.todayCount / state.dailyGoal);
  const weeklyProgress = Math.min(1, week.total / state.weeklyGoal);
  const chartMax = Math.max(state.dailyGoal, ...week.days.map((d) => d.count), 1);

  return (
    <div className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-2">
      <AppHeader onProfilePress={onOpenProfile} />

      <FeatureHeader title="התקדמות ויעדים" subtitle="התמונה הגדולה של המסע שלך" icon="target" onBack={onBack} />

      <Card className="min-h-[160px] p-5 flex flex-row items-center gap-4 mb-4 overflow-hidden">
        <div className="w-[72px] h-[72px] rounded-full bg-[#FFF5DB] flex items-center justify-center shrink-0">
          <AppIcon name="crown" size={36} color={colors.gold} />
        </div>
        <div className="flex-1 flex flex-col items-end">
          <span dir="rtl" className="text-[#718397] text-[13px] font-bold">
            נקודות התמדה – סך הכל
          </span>
          <span className="text-[#17324D] text-[34px] font-black mt-0.5 leading-tight">
            {derived.totalPoints.toLocaleString('he-IL')}
          </span>
          {!SYNC_ENABLED ? (
            <span dir="rtl" className="text-[#718397] text-[10px] mt-0.5">
              נשמר במכשיר בלבד – לא אומת בשרת
            </span>
          ) : null}
          <span dir="rtl" className="text-[#718397] text-[11px] mt-1">
            {level.isMax
              ? `הגעת לדרגה הגבוהה ביותר – ${level.name}`
              : `${level.name} · עוד ${level.toNext.toLocaleString('he-IL')} נקודות לדרגה הבאה`}
          </span>
          <div className="w-full h-[7px] rounded-full bg-[#EAF0F4] mt-3 overflow-hidden">
            <div className="h-full rounded-full bg-[#2AAE9B]" style={{ width: `${level.progress * 100}%` }} />
          </div>
        </div>
        <div className="w-[60px] h-[60px] rounded-full bg-[#EAF4FB] flex flex-col items-center justify-center shrink-0">
          <span className="text-[#1B6F8F] text-[22px] font-black leading-none">{level.level}</span>
          <span className="text-[#1B6F8F] text-[9px] font-extrabold mt-0.5">דרגה</span>
        </div>
      </Card>

      <div className="flex flex-row-reverse gap-2 mb-4">
        <SummaryCard
          title="יעד יומי"
          value={`${derived.todayCount}/${state.dailyGoal}`}
          progress={dailyProgress}
          icon="target"
          color={colors.teal}
        />
        <SummaryCard
          title={`${state.blessingGoal} ברכות`}
          value={`${blessingTotal}/${state.blessingGoal}`}
          progress={Math.min(1, blessingTotal / state.blessingGoal)}
          icon="star"
          color={colors.primary}
          onPress={onOpenBlessings}
        />
        {DVAR_TORAH_AVAILABLE ? (
        <SummaryCard
          title="רצף לימוד"
          value={`${derived.torahStreak} ימים`}
          progress={Math.min(1, derived.torahStreak / 30)}
          icon="flame"
          color={colors.coral}
          onPress={onOpenTorah}
        />
        ) : null}
      </div>

      <Card className="p-4 mb-5">
        <SectionHeader
          title="השבוע שלי"
          icon="chart"
          actionLabel={`${week.total}/${state.weeklyGoal}`}
        />
        <div className="h-[180px] flex flex-row-reverse items-end justify-between pt-3">
          {week.days.map((item) => (
            <div key={item.key} className="flex-1 h-full flex flex-col items-center justify-end">
              <span className="text-[#718397] text-[10px] font-bold mb-1">{item.isFuture ? '' : item.count}</span>
              <div className="w-5 h-[125px] rounded-full bg-[#EAF4FB] overflow-hidden flex items-end">
                {item.count > 0 && (
                  <div
                    className={`w-full rounded-full ${item.isToday ? 'bg-[#1B6F8F]' : 'bg-[#2AAE9B]'}`}
                    style={{ height: `${Math.max(8, (item.count / chartMax) * 100)}%` }}
                  />
                )}
              </div>
              <span
                className={`text-[13px] font-extrabold mt-2 ${item.isToday ? 'text-[#1B6F8F]' : 'text-[#17324D]'}`}
              >
                {item.label}
              </span>
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
        {derived.badges.filter((b) => b.key !== 'torah' || DVAR_TORAH_AVAILABLE).map((badge) => (
          <Badge
            key={badge.key}
            title={badge.title}
            subtitle={badge.earned ? `${badge.target} ${badge.unit}` : `${badge.value}/${badge.target} ${badge.unit}`}
            earned={badge.earned}
            progress={badge.value / badge.target}
            {...badgeStyle[badge.key]}
          />
        ))}
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
  earned,
  progress,
}: {
  title: string;
  subtitle: string;
  icon: IconName;
  color: string;
  background: string;
  earned: boolean;
  progress: number;
}) {
  return (
    <div
      className={`min-h-[78px] rounded-[22px] bg-white border border-[#DDE8EE] p-3 flex flex-row-reverse items-center gap-3 ${
        earned ? '' : 'opacity-75'
      }`}
    >
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
        {!earned && (
          <div className="w-full h-[5px] rounded-full bg-[#EAF0F4] mt-2 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, backgroundColor: color }} />
          </div>
        )}
      </div>
      {earned ? (
        <AppIcon name="check" size={19} color={colors.green} />
      ) : (
        <AppIcon name="lock" size={17} color={colors.textMuted} />
      )}
    </div>
  );
}
