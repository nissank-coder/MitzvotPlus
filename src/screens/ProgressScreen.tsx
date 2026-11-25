import React, { useMemo, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { AchievementBadge, Bar, ChallengeCard } from '../components/gameplay';
import { SectionHeader } from '../components/SectionHeader';
import { UnsavedMark } from '../components/SaveStatusBanner';
import { formatTime } from '../lib/dates';
import { Period, periodLogs, periodStats } from '../lib/periods';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'day', label: 'היום' },
  { key: 'week', label: 'השבוע' },
  { key: 'month', label: 'החודש' },
];

const CELL: Record<string, string> = {
  goal: 'bg-[#2AAE9B]',
  partial: 'bg-[#A8DCD4]',
  open: 'bg-white border-2 border-[#2AAE9B]',
  empty: 'bg-[#E6EEF3]',
  rest: 'bg-[repeating-linear-gradient(135deg,#EEF3F6_0_5px,#F8FAFB_5px_10px)] border border-dashed border-[#C4D3DC]',
  future: 'border border-dashed border-[#C4D3DC]',
  before: 'bg-[#F4F8FB] border border-[#EAF0F4]',
};

/**
 * "התקדמות" (round 9, B2): everything is computed from the user's own log – period completion,
 * comparison with the previous period only with a real baseline, streaks and personal best,
 * distribution by type, habits, challenge history, achievements and the journal.
 */
export function ProgressScreen() {
  const { state, derived, removeLog } = useAppStore();
  const [period, setPeriod] = useState<Period>('week');
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const stats = useMemo(() => periodStats(derived.progressContext, period), [derived.progressContext, period]);
  const journal = useMemo(() => periodLogs(derived.progressContext.byDay, stats.start, stats.end), [derived.progressContext, stats]);
  const nextAchievement = derived.achievements
    .filter((a) => !a.earned && !a.def.future)
    .sort((a, b) => b.value / b.def.threshold - a.value / a.def.threshold)[0];
  const earned = derived.achievements.filter((a) => a.earned).length;
  const history = derived.challenges.filter((c) => c.state !== 'active');
  const periodName = period === 'day' ? 'היום' : period === 'week' ? 'השבוע' : 'החודש';
  const prevName = period === 'day' ? 'אתמול' : period === 'week' ? 'השבוע שעבר' : 'החודש שעבר';

  const comparison = (() => {
    if (!stats.previous || stats.previous.percent === null) return 'עוד אין בסיס להשוואה';
    if (stats.percent === null) return `${prevName}: ${stats.previous.percent}%`;
    const diff = stats.goalDays - stats.previous.goalDays;
    if (diff > 0) return `${diff} ימי יעד יותר מ${prevName}`;
    if (diff < 0) return `${prevName}: ${stats.previous.goalDays} ימי יעד – ממשיכים בקצב שלך`;
    return `כמו ${prevName}`;
  })();

  return (
    <div dir="rtl" className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-4 flex flex-col gap-4">
      <header className="flex flex-col">
        <h1 className="text-[24px] font-black text-[#17324D]">ההתקדמות שלי</h1>
        <span className="text-[13px] text-[#5C6F82]">ביחס לעצמך בלבד · {derived.stage.name}</span>
      </header>

      <div className="flex flex-row gap-1 bg-[#E6EEF3] rounded-[14px] p-1" role="tablist" aria-label="תקופה">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={period === p.key}
            onClick={() => setPeriod(p.key)}
            className={`flex-1 min-h-[44px] rounded-[11px] text-[14px] font-extrabold ${period === p.key ? 'bg-white text-[#17324D] shadow-sm' : 'text-[#5C6F82]'}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Completion */}
      <Card className="p-4 flex flex-col gap-3">
        {period === 'day' ? (
          <>
            <span className="text-[12px] font-extrabold text-[#1B6F8F]">היעד של היום</span>
            <span className="text-[22px] font-black text-[#17324D]">
              {derived.hasHabits ? `${derived.habitsDoneToday}/${derived.habitTarget} הרגלים` : `${derived.todayCount}/${state.dailyGoal} פעולות`}
            </span>
            {derived.habitsToday.map((h) => (
              <div key={h.sel.id} className="flex flex-col gap-1">
                <div className="flex flex-row justify-between text-[13px] font-bold text-[#17324D]">
                  <span>{h.title}</span>
                  <span className="text-[#5C6F82]">{h.done ? 'בוצע' : `${Math.min(h.value, h.needed)}/${h.needed}`}</span>
                </div>
                <Bar value={Math.min(h.value, h.needed)} max={h.needed} label={h.title} />
              </div>
            ))}
          </>
        ) : (
          <>
            <span className="text-[12px] font-extrabold text-[#1B6F8F]">
              {periodName} · {stats.goalDays} מתוך {stats.eligibleDays} ימים ביעד
            </span>
            <span className="text-[24px] font-black text-[#17324D]">{stats.percent === null ? 'עוד אין ימים סגורים' : `${stats.percent}% השלמת יעד`}</span>
            <span className={`text-[13px] font-bold ${stats.previous && stats.goalDays > stats.previous.goalDays ? 'text-[#2E7D5B]' : 'text-[#5C6F82]'}`}>{comparison}</span>
            <div className={`grid gap-1.5 ${period === 'week' ? 'grid-cols-7' : 'grid-cols-7'}`} aria-label="ימי התקופה">
              {stats.days.map((d) => (
                <div key={d.key} className="flex flex-col items-center gap-1">
                  <div className={`w-full rounded-[8px] ${period === 'week' ? 'h-[56px]' : 'h-[26px]'} ${CELL[d.state]}`} title={d.key} />
                  <span className={`text-[10px] font-bold ${d.key === derived.todayKey ? 'text-[#1B6F8F]' : 'text-[#5C6F82]'}`}>{d.label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-row flex-wrap gap-x-3 gap-y-1 text-[11px] text-[#5C6F82]">
              <Legend cls={CELL.goal!} label="יעד הושלם" />
              <Legend cls={CELL.partial!} label="חלקי" />
              <Legend cls={CELL.open!} label="היום – בתהליך" />
              <Legend cls={CELL.rest!} label="שבת/חג – לא נספר" />
              <Legend cls={CELL.before!} label="לפני ההצטרפות" />
            </div>
          </>
        )}
      </Card>

      {/* Streaks */}
      <div className="grid grid-cols-3 gap-3">
        <StatTile value={derived.goalStreak} label="רצף יעד" />
        <StatTile value={derived.bestGoalStreak} label="שיא אישי" />
        <StatTile value={derived.goalDaysTotal} label="ימי התמדה" />
      </div>

      {/* Distribution */}
      <Card className="p-4 flex flex-col gap-3">
        <SectionHeader title={`לפי סוג פעילות · ${periodName}`} icon="chart" />
        {stats.byCategory.length === 0 ? (
          <p className="text-[13px] text-[#5C6F82]">עוד אין רישומים בתקופה הזו.</p>
        ) : (
          stats.byCategory.map((c) => (
            <div key={c.category} className="flex flex-col gap-1">
              <div className="flex flex-row justify-between text-[13px] font-bold text-[#17324D]">
                <span>{c.title}</span>
                <span className="text-[#5C6F82]">
                  {period === 'day' ? `${c.entries} רישומים` : `${c.days} ימים · ${c.entries} רישומים`}
                </span>
              </div>
              <Bar value={period === 'day' ? c.entries : c.days} max={period === 'day' ? Math.max(...stats.byCategory.map((x) => x.entries)) : stats.days.length} color={c.color} label={c.title} />
            </div>
          ))
        )}
      </Card>

      {/* Achievements */}
      <Card className="p-4 flex flex-col gap-3">
        <SectionHeader title={`הישגים · ${earned}/${derived.achievements.filter((a) => !a.def.future).length}`} icon="trophy" />
        {nextAchievement ? (
          <div className="rounded-[16px] bg-[#F4F8FB] p-3 flex flex-col gap-1.5">
            <div className="flex flex-row justify-between text-[13px] font-extrabold text-[#17324D]">
              <span>ההישג הבא: {nextAchievement.def.title}</span>
              <span className="text-[#5C6F82]">
                {nextAchievement.value}/{nextAchievement.def.threshold}
              </span>
            </div>
            <span className="text-[12px] text-[#5C6F82]">
              {nextAchievement.def.explanation} · עוד {nextAchievement.def.threshold - nextAchievement.value} {nextAchievement.def.unit}
            </span>
            <Bar value={nextAchievement.value} max={nextAchievement.def.threshold} label={nextAchievement.def.title} />
          </div>
        ) : null}
        <div className="grid grid-cols-4 gap-x-2 gap-y-4">
          {derived.achievements.map((a) => (
            <AchievementBadge key={a.def.id} view={a} />
          ))}
        </div>
        <p className="text-[11px] text-[#5C6F82]">ההישגים מודדים התמדה, לא את ערכו של אדם. הישגים פרטיים לא משותפים.</p>
      </Card>

      {/* Stage */}
      <Card className="p-4 flex flex-col gap-2">
        <SectionHeader title="שלב במסע" icon="target" />
        <span className="text-[17px] font-black text-[#17324D]">
          שלב {derived.stage.index}: {derived.stage.name}
        </span>
        {derived.stage.next ? (
          <>
            <Bar value={derived.stage.progress * 100} max={100} label="התקדמות בשלב" />
            <span className="text-[12px] text-[#5C6F82]">
              עוד {derived.stage.next.toGo} ימי יעד לשלב "{derived.stage.next.name}"
            </span>
          </>
        ) : null}
      </Card>

      {/* Challenge history */}
      <Card className="p-4 flex flex-col gap-3">
        <SectionHeader title="היסטוריית אתגרים" icon="calendar" />
        {history.length === 0 ? (
          <p className="text-[13px] text-[#5C6F82]">עוד אין אתגרים שהסתיימו.</p>
        ) : (
          history
            .slice()
            .reverse()
            .map((c) => <ChallengeCard key={c.enrollment.instanceId} view={c} compact />)
        )}
      </Card>

      {/* Journal */}
      <Card className="p-4 flex flex-col">
        <SectionHeader title={`יומן · ${periodName} (${journal.length})`} icon="scroll" />
        {journal.length === 0 ? (
          <p className="text-[13px] text-[#5C6F82]">אין רישומים בתקופה.</p>
        ) : (
          journal.slice(0, 40).map((log) => (
            <div key={log.id} className="flex flex-row items-center gap-2 min-h-[44px] border-t border-[#EAF0F4]">
              <span className="flex-1 text-[14px] font-bold text-[#17324D]">
                {log.title} <UnsavedMark logId={log.id} />
              </span>
              <span className="text-[12px] text-[#5C6F82]">
                {period === 'day' ? formatTime(log.createdAt) : `${log.dateKey.slice(8)}/${log.dateKey.slice(5, 7)}`}
                {log.backfill ? ' · בדיעבד' : ''}
              </span>
              <span className="text-[12px] font-bold text-[#946300] w-[42px] text-left">{derived.pointsByLog.get(log.id) ?? 0}</span>
              <button type="button" onClick={() => setPendingRemove({ id: log.id, title: log.title })} aria-label={`מחיקה: ${log.title}`} className="w-9 h-9 flex items-center justify-center">
                <AppIcon name="close" size={14} color={colors.textMuted} />
              </button>
            </div>
          ))
        )}
      </Card>

      <ConfirmDialog
        open={pendingRemove !== null}
        destructive
        title="תיקון היומן"
        message={pendingRemove ? `להסיר את "${pendingRemove.title}"? ההתקדמות תחושב מחדש.` : ''}
        confirmLabel="הסרה"
        cancelLabel="השארה"
        onConfirm={() => {
          if (pendingRemove) removeLog(pendingRemove.id);
          setPendingRemove(null);
        }}
        onClose={() => setPendingRemove(null)}
      />
    </div>
  );
}

function Legend({ cls, label }: { cls: string; label: string }) {
  return (
    <span className="flex flex-row items-center gap-1">
      <span className={`inline-block w-3 h-3 rounded-[3px] ${cls}`} aria-hidden="true" />
      {label}
    </span>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-[18px] bg-white border border-[#DDE8EE] card-shadow p-3 flex flex-col">
      <span className="text-[22px] font-black text-[#17324D]">{value}</span>
      <span className="text-[12px] font-bold text-[#5C6F82]">{label}</span>
    </div>
  );
}
