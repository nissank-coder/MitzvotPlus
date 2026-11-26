import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button, Num, Ring, ScreenHeader, SectionTitle, Surface } from '../components/ds';
import { UnsavedMark } from '../components/SaveStatusBanner';
import { blessingCategoryMeta } from '../data';
import { ACTIONS, BLESSING_GOAL_BONUS } from '../data/actions';
import { formatTime } from '../lib/dates';
import { useAppStore } from '../store/AppStore';
import { ds } from '../theme';
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

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'all', label: 'כל היום' },
  { key: 'morning', label: 'בוקר' },
  { key: 'noon', label: 'צהריים' },
  { key: 'evening', label: 'ערב' },
];
/** The tradition's 100 blessings a day; the personal goal (state.blessingGoal) may differ. */
const TRADITION = 100;

/**
 * "100 ברכות" – design round 1. The count is the focus: a large number, a ring that supports it
 * (the number keeps counting past the goal while the ring stays full). One tap records ONE blessing
 * (never a bundle or a whole prayer). Every entry can be corrected: "ביטול האחרונה" or the × in the
 * list – the same removal as everywhere (Home is updated from the same log).
 */
export function BlessingsScreen({ onBack }: Props) {
  const { state, derived, addBlessing, removeLog, isLogSaved, saveStatus } = useAppStore();
  const total = derived.blessingTotal;
  const goal = state.blessingGoal;
  const [period, setPeriod] = useState<Period>('all');
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const remaining = Math.max(0, goal - total);
  const latest = derived.todayBlessings[0];

  const shown = useMemo(() => derived.todayBlessings.filter((log) => inPeriod(log.createdAt, period)), [derived.todayBlessings, period]);

  // The goal message appears once the blessing that reached the goal is stored on the device
  // (never for an entry that failed to save), once per day, inline – it does not block anything.
  const [celebrate, setCelebrate] = useState(false);
  const [reached, setReached] = useState(false);
  const celebratedDay = useRef<string | null>(null);
  useEffect(() => {
    if (!celebrate || !latest || total < goal) return;
    if (celebratedDay.current === derived.todayKey) return;
    if (!isLogSaved(latest.id)) return;
    celebratedDay.current = derived.todayKey;
    setCelebrate(false);
    setReached(true);
    const t = window.setTimeout(() => setReached(false), 6000);
    return () => window.clearTimeout(t);
  }, [celebrate, latest, total, goal, derived.todayKey, isLogSaved, saveStatus]);

  const add = (category: BlessingCategory) => {
    // No cap at the goal: every additional blessing is still counted.
    addBlessing(category);
    if (total + 1 === goal) setCelebrate(true);
  };

  return (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-4">
      <ScreenHeader title="100 ברכות" subtitle="סופרים בשקט, מתקדמים בשמחה" onBack={onBack} />

      {/* The count */}
      <Surface tone="brand" as="section" aria-label="הברכות שלי היום" className="p-5 flex flex-col items-center gap-4 rounded-[var(--radius-hero)]">
        <Ring value={total} max={goal} size={188} stroke={14} onBrand>
          <span className="num text-[60px] font-extrabold leading-none" aria-label={`${total} ברכות היום`}>
            {total}
          </span>
          <span className="text-[14px] font-bold text-on-brand-muted mt-1">ברכות היום</span>
        </Ring>
        <div className="flex flex-col items-center gap-1 text-center" role="status">
          {total >= goal ? (
            <span className="inline-flex flex-row items-center gap-1.5 rounded-full bg-lime text-ink px-3 min-h-[32px] text-[14px] font-extrabold">
              <AppIcon name="check" size={16} color={ds.ink} strokeWidth={3} />
              {total > goal ? (
                <>
                  היעד הושלם · <Num>+{total - goal}</Num> מעבר
                </>
              ) : (
                'היעד היומי הושלם'
              )}
            </span>
          ) : (
            <span className="text-[17px] font-extrabold">
              עוד <Num>{remaining}</Num> ליעד היומי שלך
            </span>
          )}
          <span className="text-[13px] text-on-brand-muted">
            היעד האישי: <Num>{goal}</Num> ברכות ביום{goal !== TRADITION ? ` · המנהג: ${TRADITION} ברכות` : ''}
          </span>
          {reached ? <span className="text-[15px] font-extrabold text-lime mt-1">השלמת את היעד היומי. יישר כוח!</span> : null}
        </div>
        <div className="w-full flex flex-row gap-2">
          <Button variant="lime" size="lg" icon="plus" className="flex-1" onClick={() => add('other')} aria-label="+ ברכה – רישום ברכה אחת">
            ברכה
          </Button>
          {latest ? (
            <Button variant="onBrand" size="lg" icon="reset" onClick={() => setPendingRemove({ id: latest.id, title: latest.title })} aria-label={`ביטול הברכה האחרונה (${formatTime(latest.createdAt)})`}>
              ביטול האחרונה
            </Button>
          ) : null}
        </div>
      </Surface>

      {/* By kind */}
      <Surface as="section" aria-label="רישום לפי סוג" className="p-4 flex flex-col gap-3">
        <SectionTitle title="רישום לפי סוג" />
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(blessingCategoryMeta) as BlessingCategory[]).map((key) => {
            const meta = blessingCategoryMeta[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => add(key)}
                aria-label={`הוספת ברכה: ${meta.title} (${derived.blessingCounts[key]} היום)`}
                className="min-h-[72px] rounded-[18px] bg-canvas border border-line px-3 flex flex-row items-center gap-2.5 text-right active:bg-brand-soft"
              >
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[14px] font-extrabold text-ink leading-tight">{meta.title}</span>
                  <span className="text-[13px] text-ink-muted">
                    <Num>{derived.blessingCounts[key]}</Num> היום
                  </span>
                </span>
                <span className="w-10 h-10 rounded-full bg-brand flex items-center justify-center shrink-0" aria-hidden="true">
                  <AppIcon name="plus" size={20} color={ds.white} strokeWidth={2.6} />
                </span>
              </button>
            );
          })}
        </div>
      </Surface>

      {/* Today's blessings – with correction */}
      <Surface as="section" aria-label="הברכות שנרשמו היום" className="px-4 pt-3 pb-2 flex flex-col gap-2">
        <SectionTitle title="נרשמו היום" />
        <div role="radiogroup" aria-label="חלק היום" className="flex flex-row gap-1 rounded-full bg-canvas p-1">
          {PERIODS.map((pItem) => (
            <button
              key={pItem.key}
              type="button"
              role="radio"
              aria-checked={period === pItem.key}
              onClick={() => setPeriod(pItem.key)}
              className={`flex-1 min-h-[44px] rounded-full text-[13px] font-bold ${period === pItem.key ? 'bg-surface text-brand ds-shadow' : 'text-ink-muted'}`}
            >
              {pItem.label}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="py-4 text-[14px] text-ink-muted text-center">{total > 0 ? 'אין ברכות בחלק זה של היום.' : 'הברכה הראשונה של היום מחכה לך.'}</p>
        ) : (
          <ul className="flex flex-col">
            {shown.slice(0, 12).map((item) => (
              <li key={item.id} className="flex flex-row items-center gap-2 min-h-[52px] border-t border-line first:border-t-0">
                <span className="num text-[13px] text-ink-muted w-12">{formatTime(item.createdAt)}</span>
                <span className="flex-1 min-w-0 text-[15px] font-bold text-ink truncate">
                  {blessingCategoryMeta[item.category ?? 'other'].title}
                  {item.bundleOf ? <span className="text-[12px] font-bold text-ink-muted"> · מתוך תפילה</span> : null} <UnsavedMark logId={item.id} />
                </span>
                <button
                  type="button"
                  onClick={() => setPendingRemove({ id: item.id, title: item.title })}
                  aria-label={`ביטול הרישום: ${item.title} ${formatTime(item.createdAt)}`}
                  className="w-11 h-11 rounded-full flex items-center justify-center active:bg-canvas"
                >
                  <AppIcon name="close" size={16} color={ds.inkMuted} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 12 ? <p className="text-[12px] text-ink-muted pb-1">ועוד {shown.length - 12} ברכות</p> : null}
      </Surface>

      <p className="text-[12px] text-ink-muted px-1">
        <Num>{ACTIONS.blessing.points}</Num> נקודות התמדה לברכה, <Num>{BLESSING_GOAL_BONUS}</Num> בהשלמת היעד היומי. הנקודות הן כלי לתיעוד ולהתמדה, לא מדד לערך.
      </p>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="ביטול רישום"
        message={pendingRemove ? `להסיר את "${pendingRemove.title}" מהיומן? הספירה והנקודות יתעדכנו גם במסך הבית.` : ''}
        confirmLabel="הסרה"
        cancelLabel="השארה"
        destructive
        onConfirm={() => pendingRemove && removeLog(pendingRemove.id)}
        onClose={() => setPendingRemove(null)}
      />
    </div>
  );
}
