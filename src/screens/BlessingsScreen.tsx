import React, { useMemo, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CitySilhouette, HillDecoration } from '../components/Decorations';
import { FeatureHeader } from '../components/FeatureHeader';
import { ProgressRing } from '../components/ProgressRing';
import { SectionHeader } from '../components/SectionHeader';
import { blessingCategoryMeta } from '../data';
import { formatTime } from '../lib/dates';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { BlessingCategory } from '../types';

type Props = {
  onBack: () => void;
  onOpenProfile: () => void;
};

type Period = 'morning' | 'noon' | 'evening' | 'all';

function inPeriod(timestamp: number, period: Period): boolean {
  const hour = new Date(timestamp).getHours();
  if (period === 'morning') return hour < 12;
  if (period === 'noon') return hour >= 12 && hour < 17;
  if (period === 'evening') return hour >= 17;
  return true;
}

const periodItems: Array<{ key: Period; label: string; icon: 'sun' | 'moon' | 'calendar' }> = [
  { key: 'morning', label: 'בוקר', icon: 'sun' },
  { key: 'noon', label: 'צהריים', icon: 'sun' },
  { key: 'evening', label: 'ערב', icon: 'moon' },
  { key: 'all', label: 'כל היום', icon: 'calendar' },
];

export function BlessingsScreen({ onBack, onOpenProfile }: Props) {
  const { state, derived, addBlessing, removeLog } = useAppStore();
  const blessingTotal = derived.blessingTotal;
  const [period, setPeriod] = useState<Period>('all');
  const [dialog, setDialog] = useState<{ title: string; message: string } | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const progress = Math.min(1, blessingTotal / state.blessingGoal);
  const remaining = Math.max(0, state.blessingGoal - blessingTotal);

  const latestLogs = useMemo(
    () => derived.todayBlessings.filter((log) => inPeriod(log.createdAt, period)).slice(0, 7),
    [derived.todayBlessings, period],
  );

  const handleAdd = (category: BlessingCategory) => {
    // No cap at the goal: every additional blessing is still counted.
    addBlessing(category);
    if (blessingTotal + 1 === state.blessingGoal) {
      setDialog({
        title: '100 ברכות',
        message: 'השלמת את היעד היומי. כל הכבוד!',
      });
    }
  };

  return (
    <div className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-2">
      <AppHeader onProfilePress={onOpenProfile} />
      <FeatureHeader
        title="100 ברכות"
        subtitle="סופרים בשקט, מתקדמים בשמחה"
        icon="star"
        onBack={onBack}
      />

      <div className="relative min-h-[184px] rounded-[28px] overflow-hidden border border-[#D5E8EC] p-4 mb-4 bg-gradient-to-b from-[#F8FDFF] to-[#E8F7F5] card-shadow flex items-center">
        <CitySilhouette opacity={0.22} />
        <div className="relative z-10 w-full flex flex-row-reverse items-center justify-between gap-4">
          <ProgressRing progress={progress} size={132} strokeWidth={12}>
            <AppIcon name="cup" size={25} color={colors.teal} />
            <span className="text-[#17324D] text-[17px] font-black mt-0.5">{blessingTotal}/{state.blessingGoal}</span>
          </ProgressRing>
          <div className="flex-1 flex flex-col items-end">
            <div className="flex flex-row-reverse items-center gap-1">
              <span dir="rtl" className="text-[#1B6F8F] text-[13px] font-extrabold">
                היעד היומי
              </span>
              <AppIcon name="target" size={18} color={colors.teal} />
            </div>
            <h2 dir="rtl" className="text-[#17324D] text-[27px] font-black mt-2 leading-tight">
              {state.blessingGoal} ברכות
            </h2>
            <p dir="rtl" className="text-[#718397] text-[13px] text-right mt-1">
              {remaining === 0
                ? blessingTotal > state.blessingGoal
                  ? `היעד הושלם, ועוד ${blessingTotal - state.blessingGoal} ברכות מעבר`
                  : 'היעד הושלם להיום'
                : `עוד ${remaining} ברכות להשלמת היעד`}
            </p>
            <div className="mt-3 px-2.5 py-[5px] rounded-full bg-[#FFF5DB] flex flex-row-reverse items-center gap-1">
              <AppIcon name="coin" size={15} color={colors.gold} />
              <span className="text-[#946300] text-[11px] font-extrabold">5 נקודות לכל ברכה</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-row-reverse gap-2 mb-5">
        {periodItems.map((item) => {
          const active = period === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setPeriod(item.key)}
              className={`flex-1 min-h-[44px] rounded-full border flex flex-row-reverse items-center justify-center gap-1 transition-colors ${
                active
                  ? 'bg-[#2AAE9B] border-[#2AAE9B] text-white'
                  : 'bg-white border-[#DDE8EE] text-[#17324D] hover:bg-[#EAF4FB]'
              }`}
            >
              <AppIcon name={item.icon} size={17} color={active ? colors.white : colors.primary} />
              <span className={`text-[13px] font-extrabold ${active ? 'text-white' : 'text-[#17324D]'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <SectionHeader title="הוספת ברכה" icon="plus" />
      <div className="grid grid-cols-2 gap-3 mb-5" dir="rtl">
        {(Object.keys(blessingCategoryMeta) as BlessingCategory[]).map((key) => {
          const meta = blessingCategoryMeta[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => handleAdd(key)}
              className="min-h-[154px] bg-white rounded-[22px] border border-[#DDE8EE] flex flex-col items-center justify-center p-3 hover:border-[#2AAE9B] active:scale-[0.98] transition-all"
            >
              <div
                className="w-11 h-11 rounded-[16px] flex items-center justify-center"
                style={{ backgroundColor: meta.background }}
              >
                <AppIcon name={meta.icon} size={23} color={meta.color} />
              </div>
              <span className="text-[#17324D] text-[23px] font-black mt-2">
                {derived.blessingCounts[key]}
              </span>
              <span dir="rtl" className="text-[#718397] text-[13px] font-bold mt-0.5 text-center">
                {meta.title}
              </span>
              <div className="mt-2 flex flex-row-reverse items-center gap-0.5">
                <AppIcon name="plus" size={14} color={colors.teal} strokeWidth={2.2} />
                <span className="text-[#2AAE9B] text-[11px] font-black">הוספה</span>
              </div>
            </button>
          );
        })}
      </div>

      <Card className="p-4 mb-4">
        <SectionHeader title="הברכות שלי" icon="calendar" actionLabel={`${blessingTotal} היום`} />
        {latestLogs.length === 0 ? (
          <div className="flex flex-col items-center py-5">
            <AppIcon name="cup" size={34} color={colors.teal} />
            <span className="mt-2 text-[#17324D] text-[17px] font-black">{blessingTotal > 0 ? 'אין ברכות בחלק זה של היום' : 'הברכה הראשונה מחכה לך'}
            </span>
            <span dir="rtl" className="mt-1 text-[#718397] text-[13px]">
              {blessingTotal > 0 ? 'בחרו "כל היום" כדי לראות הכל' : 'בחרו קטגוריה למעלה כדי להתחיל'}
            </span>
          </div>
        ) : (
          latestLogs.map((item, index) => {
            const meta = blessingCategoryMeta[item.category ?? 'other'];
            return (
              <div
                key={item.id}
                className={`min-h-[62px] flex flex-row items-center justify-between py-2 ${
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
                <div className="flex-1 flex flex-row-reverse items-center gap-3">
                  <div className="flex-1 flex flex-col items-end">
                    <span dir="rtl" className="text-[#17324D] text-[15px] font-extrabold">
                      {item.title}
                    </span>
                    <span dir="rtl" className="text-[#718397] text-[11px] mt-0.5">
                      {meta.title}
                    </span>
                  </div>
                  <div
                    className="w-[38px] h-[38px] rounded-[16px] flex items-center justify-center shrink-0"
                    style={{ backgroundColor: meta.background }}
                  >
                    <AppIcon name={meta.icon} size={19} color={meta.color} />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </Card>

      <Card className="min-h-[132px] p-4 flex flex-row items-center gap-3 overflow-hidden">
        <HillDecoration />
        <div className="flex-1 flex flex-col items-end">
          <div className="flex flex-row-reverse items-center gap-2">
            <span dir="rtl" className="text-[#17324D] text-[17px] font-black">
              {remaining === 0 ? 'איזה יופי!' : 'ממשיכים בקצב שלך'}
            </span>
            <AppIcon name="trophy" size={22} color={colors.gold} />
          </div>
          <span dir="rtl" className="text-[#718397] text-[13px] mt-1">
            {remaining === 0 ? 'השלמת את היעד היומי' : `עוד ${remaining} ברכות להשלמת היעד`}
          </span>
          <div className="w-full h-2 rounded-full bg-[#EAF0F4] mt-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#2AAE9B] transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={Boolean(dialog)}
        title={dialog?.title ?? ''}
        message={dialog?.message ?? ''}
        confirmLabel="מעולה"
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        open={pendingRemove !== null}
        title="ביטול רישום"
        message={pendingRemove ? `להסיר את "${pendingRemove.title}" מהיומן? הנקודות יופחתו.` : ''}
        confirmLabel="הסרה"
        cancelLabel="ביטול"
        destructive
        onConfirm={() => pendingRemove && removeLog(pendingRemove.id)}
        onClose={() => setPendingRemove(null)}
      />
    </div>
  );
}
