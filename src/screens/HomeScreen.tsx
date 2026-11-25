import React, { useEffect, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { BackfillSheet } from '../components/BackfillSheet';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Bar, ChallengeCard, HabitEditorSheet } from '../components/gameplay';
import { ProgressRing } from '../components/ProgressRing';
import { UnsavedMark } from '../components/SaveStatusBanner';
import { SectionHeader } from '../components/SectionHeader';
import { TodayCard } from '../components/TodayCard';
import { TodayPlanCard } from '../components/TodayPlanCard';
import { ideaForDay, loadPracticalIdeas, PRACTICAL_CATEGORY, PracticalIdea } from '../content/practical';
import { DVAR_TORAH_AVAILABLE } from '../content/registry';
import { formatTime } from '../lib/dates';
import { habitById } from '../lib/habits';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { FeatureKey, IconName } from '../types';

type Props = {
  onOpenFeature: (feature: Exclude<FeatureKey, null>) => void;
  onOpenProfile: () => void;
  onOpenProgress: () => void;
  onOpenTracks: () => void;
  onQuickAdd: () => void;
};

/**
 * "היום" (round 9, B1): personal goal from the chosen habits, the next step, the core four,
 * the active challenge, a practical idea, today's summary and one-tap logging. The siddur,
 * zmanim and the calendar checklist are tools further down – not the centre of the screen.
 * Every number comes from the user's own log.
 */
export function HomeScreen({ onOpenFeature, onOpenProfile, onOpenProgress, onOpenTracks, onQuickAdd }: Props) {
  const { state, derived, calendar, addAction, addBlessing, removeLog } = useAppStore();
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const [ideas, setIdeas] = useState<PracticalIdea[]>([]);
  useEffect(() => {
    loadPracticalIdeas().then(setIdeas, () => setIdeas([]));
  }, []);

  const pending = calendar.pendingBackfill;
  const habits = derived.habitsToday;
  const target = derived.habitTarget;
  const done = derived.habitsDoneToday;
  const nextHabit = habits.find((h) => !h.done);
  const activeChallenge = derived.challenges.find((c) => c.state === 'active');
  const idea = ideaForDay(ideas, derived.todayKey, habits.map((h) => h.sel.id));
  const ideaTitle = idea ? `${habitById(idea.habit)?.title ?? ''}: רעיון היום` : '';
  const ideaDone = idea ? derived.todayLogs.some((l) => l.title === ideaTitle) : false;
  const returning = derived.activityStreak === 0 && derived.totalCount > 0;
  const hour = calendar.now.getHours();
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';
  const recordHabit = (id: string) => {
    const def = habitById(id);
    if (!def) return;
    if (def.logAction === 'blessing') addBlessing('other');
    else addAction(def.logAction);
  };

  return (
    <div dir="rtl" className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-4 flex flex-col gap-4">
      {/* Greeting */}
      <header className="flex flex-row items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-[22px] font-black text-[#17324D]">
            {greeting}, {state.userName}
          </h1>
          <span className="text-[13px] text-[#5C6F82]">
            {calendar.day.hebrewDate}
            {calendar.day.parsha ? ` · ${calendar.day.parsha}` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="אני – פרופיל והגדרות"
          className="w-11 h-11 rounded-full bg-[#E3F0F6] text-[#1B6F8F] font-black text-[16px]"
        >
          {state.userName.slice(0, 1)}
        </button>
      </header>

      {pending.length > 0 ? (
        <button
          type="button"
          onClick={() => setBackfillOpen(true)}
          className="w-full rounded-[22px] bg-[#17324D] text-white p-4 flex flex-row items-center gap-3 text-right"
        >
          <AppIcon name="flame" size={24} color={colors.gold} />
          <span className="flex-1 flex flex-col">
            <span className="text-[15px] font-black">שבוע טוב! מה עשית ב{pending.length > 1 ? 'חג' : 'שבת'}?</span>
            <span className="text-[12px] text-[#BDECE3]">רישום בדיעבד, בלי לחץ</span>
          </span>
          <AppIcon name="chevronLeft" size={20} color={colors.white} />
        </button>
      ) : null}

      {/* Personal goal */}
      <Card className="p-4 flex flex-col gap-3">
        {derived.hasHabits ? (
          <>
            <div className="flex flex-row items-center gap-4">
              <ProgressRing progress={target > 0 ? Math.min(1, done / target) : 0} size={92} strokeWidth={10}>
                <span className="text-[22px] font-black text-[#17324D]">
                  {done}/{target}
                </span>
                <span className="text-[11px] font-bold text-[#5C6F82]">הרגלים</span>
              </ProgressRing>
              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-[12px] font-extrabold text-[#1B6F8F]">היעד שלי היום</span>
                <span className="text-[19px] font-black text-[#17324D] leading-tight">
                  {derived.todayGoalMet
                    ? 'היעד הושלם. יישר כוח'
                    : returning
                      ? 'ברוך השב. כל יום הוא התחלה'
                      : target - done === 1
                        ? 'עוד הרגל אחד להשלמת היום'
                        : `עוד ${target - done} הרגלים להשלמת היום`}
                </span>
                <div className="flex flex-row flex-wrap gap-1.5">
                  <Pill tone="coral">{derived.goalStreak > 0 ? `רצף יעד ${derived.goalStreak} ימים` : 'רצף יעד מתחיל היום'}</Pill>
                  {derived.bestGoalStreak > 0 ? <Pill tone="mint">שיא {derived.bestGoalStreak}</Pill> : null}
                  <Pill tone="gold">{derived.todayPoints} נק׳ היום</Pill>
                </div>
              </div>
            </div>
            <ul className="flex flex-col border-t border-[#EAF0F4]">
              {habits.map((h, i) => (
                <li key={h.sel.id} className={`flex flex-row items-center gap-3 min-h-[52px] ${i < habits.length - 1 ? 'border-b border-[#EAF0F4]' : ''}`}>
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${h.done ? 'bg-[#2AAE9B]' : 'border-2 border-[#B9CCD6]'}`}
                    aria-hidden="true"
                  >
                    {h.done ? <AppIcon name="check" size={15} color={colors.white} strokeWidth={3} /> : null}
                  </span>
                  <span className="flex-1 flex flex-col">
                    <span className="text-[15px] font-bold text-[#17324D]">{h.title}</span>
                    <span className="text-[12px] text-[#5C6F82]">
                      {h.needed > 1 ? `${Math.min(h.value, h.needed)}/${h.needed}` : h.done ? 'בוצע היום' : 'עוד לא נרשם'}
                      {h.sel.perWeek < 7 ? ` · ${h.sel.perWeek} בשבוע` : ''}
                    </span>
                  </span>
                  {!h.done ? (
                    <button
                      type="button"
                      onClick={() => recordHabit(h.sel.id)}
                      aria-label={`רשמתי: ${h.title}`}
                      className="min-h-[40px] px-4 rounded-full bg-[#2AAE9B] text-white text-[13px] font-black"
                    >
                      {h.needed > 1 ? '+1' : 'רשמתי'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => setHabitsOpen(true)} className="self-start text-[13px] font-bold text-[#1B6F8F] min-h-[36px]">
              שינוי ההרגלים שלי
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <span className="text-[12px] font-extrabold text-[#1B6F8F]">היעד שלי היום</span>
            <span className="text-[18px] font-black text-[#17324D]">
              {derived.todayCount} מתוך {state.dailyGoal} פעולות שונות
            </span>
            <Bar value={derived.todayCount} max={state.dailyGoal} label="יעד יומי" />
            <div className="rounded-[16px] bg-[#F1FAF8] border border-[#CFE9E3] p-3 flex flex-col gap-2">
              <span className="text-[14px] font-extrabold text-[#17324D]">חדש: יעד לפי 2–3 הרגלים שתבחר</span>
              <span className="text-[12px] text-[#5C6F82]">ההיסטוריה והנקודות נשמרות. היעד החדש יחול מהיום.</span>
              <button type="button" onClick={() => setHabitsOpen(true)} className="self-start min-h-[42px] px-4 rounded-full bg-[#2AAE9B] text-white text-[13px] font-black">
                בחירת הרגלים
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Next step */}
      <div className="rounded-[22px] bg-[#17324D] p-4 flex flex-row items-center gap-3">
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-[12px] font-extrabold text-[#9FD8CF]">הצעד הבא שלי</span>
          <span className="text-[16px] font-black text-white">
            {nextHabit ? nextHabit.title : activeChallenge ? activeChallenge.def.title : 'להצטרף לאתגר קטן'}
          </span>
          <span className="text-[12px] text-[#C9D6E0]">
            {nextHabit
              ? 'רושמים רק מה שכבר נעשה'
              : activeChallenge
                ? `${activeChallenge.value}/${activeChallenge.target} ${activeChallenge.def.unit}`
                : 'אתגר אישי נותן כיוון לשבוע'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => (nextHabit ? recordHabit(nextHabit.sel.id) : onOpenTracks())}
          className="min-h-[48px] px-5 rounded-[14px] bg-[#2AAE9B] text-white text-[14px] font-black"
        >
          {nextHabit ? 'רשמתי' : activeChallenge ? 'למסלולים' : 'בחירת אתגר'}
        </button>
      </div>

      {/* Core four */}
      <section aria-label="הליבה שלי" className="grid grid-cols-2 gap-3">
        <CoreTile
          title="100 ברכות"
          tone="#946300"
          value={`${derived.blessingTotal}/${state.blessingGoal}`}
          note={derived.blessingTotal >= state.blessingGoal ? 'היעד הושלם' : `עוד ${state.blessingGoal - derived.blessingTotal}`}
          progress={derived.blessingTotal / state.blessingGoal}
          icon="cup"
          onPress={() => onOpenFeature('blessings')}
        />
        <CoreTile
          title={DVAR_TORAH_AVAILABLE ? 'דבר תורה' : 'לימוד יומי'}
          tone="#6B4FB8"
          value={derived.learnedToday ? 'נלמד היום' : 'עוד לא נרשם'}
          note={derived.torahStreak > 0 ? `רצף לימוד ${derived.torahStreak} ימים` : 'כל לימוד נחשב'}
          icon="book"
          onPress={() => onOpenFeature(DVAR_TORAH_AVAILABLE ? 'torah' : 'learning')}
        />
        <CoreTile
          title="ההתקדמות שלי"
          tone="#1B6F8F"
          value={derived.consistency === null ? 'עוד אין בסיס' : `${derived.consistency}% עקביות`}
          note={`${derived.stage.name} · ${derived.goalDaysTotal} ימי יעד`}
          icon="chart"
          onPress={onOpenProgress}
        />
        <CoreTile title="שמירת הלשון" tone="#1B6F8F" value="פרטי" note="נשמר רק במכשיר" icon="shield" onPress={() => onOpenFeature('speech')} />
      </section>

      {/* Active challenge */}
      {activeChallenge ? (
        <button type="button" onClick={onOpenTracks} className="text-right">
          <ChallengeCard view={activeChallenge} compact />
        </button>
      ) : derived.joinableChallenges.length > 0 ? (
        <Card className="p-4 flex flex-row items-center gap-3">
          <div className="flex-1 flex flex-col">
            <span className="text-[12px] font-extrabold text-[#1B6F8F]">אין אתגר פעיל</span>
            <span className="text-[15px] font-black text-[#17324D]">{derived.joinableChallenges[0]!.title}</span>
            <span className="text-[12px] text-[#5C6F82]">{derived.joinableChallenges[0]!.description}</span>
          </div>
          <button type="button" onClick={onOpenTracks} className="min-h-[42px] px-4 rounded-full border border-[#2AAE9B] text-[#1E8C7C] text-[13px] font-black">
            למסלולים
          </button>
        </Card>
      ) : null}

      {/* Practical idea – only approved content in production; drafts only in internal builds */}
      {idea ? (
        <Card className={`p-4 flex flex-col gap-2 ${idea.status === 'DRAFT' ? 'border-dashed' : ''}`}>
          <div className="flex flex-row items-center justify-between">
            <span className="text-[12px] font-extrabold text-[#2E7D5B]">רעיון מעשי ליום · {PRACTICAL_CATEGORY[idea.category]}</span>
            {idea.status === 'DRAFT' ? (
              <span className="text-[10px] font-black text-[#8A5A00] bg-[#FFF5DB] rounded px-2 py-0.5">טיוטה פנימית · לא מאושר</span>
            ) : null}
          </div>
          <p className="text-[15px] font-bold text-[#17324D] leading-6">{idea.text}</p>
          <button
            type="button"
            disabled={ideaDone}
            onClick={() => {
              const def = habitById(idea.habit);
              if (def && def.logAction !== 'blessing') addAction(def.logAction, { title: ideaTitle });
            }}
            className={`self-start min-h-[40px] px-4 rounded-full text-[13px] font-black ${ideaDone ? 'bg-[#EAF7EF] text-[#4DAA78]' : 'bg-[#2AAE9B] text-white'}`}
          >
            {ideaDone ? 'נרשם ✓' : 'עשיתי'}
          </button>
        </Card>
      ) : null}

      {/* Quick log – one tap */}
      <section aria-label="רישום מהיר" className="flex flex-col gap-2">
        <SectionHeader title="רישום מהיר" icon="plus" actionLabel="עוד" onAction={onQuickAdd} />
        <div className="flex flex-row flex-wrap gap-2">
          <QuickChip label="+ ברכה" onPress={() => addBlessing('other')} />
          {habits
            .filter((h) => h.def.logAction !== 'blessing')
            .map((h) => (
              <QuickChip key={h.sel.id} label={`+ ${h.def.title}`} onPress={() => addAction(h.def.logAction)} />
            ))}
          {!habits.some((h) => h.def.logAction === 'chesed') ? <QuickChip label="+ מעשה חסד" onPress={() => addAction('chesed')} /> : null}
        </div>
      </section>

      {/* Today summary */}
      <Card className="p-4 flex flex-col gap-3">
        <SectionHeader title="סיכום היום" icon="check" />
        <div className="grid grid-cols-4 gap-2 text-center">
          <Stat value={derived.todayEntries} label="רישומים" />
          <Stat value={derived.todayCount} label="פעולות" />
          <Stat value={derived.blessingTotal} label="ברכות" />
          <Stat value={derived.todayPoints} label="נקודות" />
        </div>
        {derived.todayLogs.length === 0 ? (
          <p className="text-[13px] text-[#5C6F82]">עוד לא נרשם דבר היום. פעולה אחת מספיקה כדי להתחיל.</p>
        ) : (
          <ul className="flex flex-col">
            {derived.todayLogs.slice(0, 5).map((log) => (
              <li key={log.id} className="flex flex-row items-center gap-2 min-h-[44px] border-t border-[#EAF0F4]">
                <span className="flex-1 text-[14px] font-bold text-[#17324D]">
                  {log.title} <UnsavedMark logId={log.id} />
                </span>
                <span className="text-[12px] text-[#5C6F82]">{formatTime(log.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => setPendingRemove({ id: log.id, title: log.title })}
                  aria-label={`ביטול: ${log.title}`}
                  className="w-9 h-9 flex items-center justify-center"
                >
                  <AppIcon name="close" size={14} color={colors.textMuted} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Weekly summary */}
      <Card className="p-4 flex flex-col gap-2">
        <SectionHeader title="השבוע שלי" icon="chart" actionLabel="התקדמות" onAction={onOpenProgress} />
        <div className="flex flex-row items-end gap-1.5 h-[64px]" aria-hidden="true">
          {derived.week.days.map((d) => {
            const met = derived.progressContext.goalMet(d.key);
            const rest = !d.count && derived.progressContext.isRestDay(d.key);
            return (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className={`w-full rounded-[6px] ${d.isFuture ? 'border border-dashed border-[#C4D3DC] h-[44px]' : met ? 'bg-[#2AAE9B] h-[44px]' : d.count > 0 ? 'bg-[#A8DCD4] h-[24px]' : rest ? 'bg-[#EEF3F6] h-[44px]' : 'bg-[#E6EEF3] h-[6px]'}`}
                />
                <span className={`text-[11px] font-bold ${d.isToday ? 'text-[#1B6F8F]' : 'text-[#5C6F82]'}`}>{d.label}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[13px] text-[#5C6F82]">
          {derived.week.days.filter((d) => derived.progressContext.goalMet(d.key)).length} ימי יעד השבוע · שבת וחג לא נספרים כחסרים
        </p>
      </Card>

      {/* Tools: zmanim, siddur, the calendar checklist */}
      <Card className="p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setToolsOpen((v) => !v)}
          aria-expanded={toolsOpen}
          className="w-full min-h-[56px] px-4 flex flex-row items-center justify-between text-[15px] font-extrabold text-[#17324D]"
        >
          <span>זמנים, סידור ומצוות היום לפי הלוח</span>
          <span className="text-[13px] text-[#5C6F82]">{toolsOpen ? 'סגירה ▴' : 'פתיחה ▾'}</span>
        </button>
        {toolsOpen ? (
          <div className="px-3 pb-3 flex flex-col gap-3">
            <div className="flex flex-row flex-wrap gap-2">
              <QuickChip label="סידור" onPress={() => onOpenFeature('siddur')} />
              <QuickChip label="תהילים" onPress={() => onOpenFeature('tehillim')} />
              <QuickChip label="זמני תפילה" onPress={() => onOpenFeature('prayers')} />
              <QuickChip label="איזו ברכה?" onPress={() => onOpenFeature('blessingGuide')} />
            </div>
            <TodayCard onOpenZmanim={() => onOpenFeature('prayers')} />
            <TodayPlanCard />
          </div>
        ) : null}
      </Card>

      <ConfirmDialog
        open={pendingRemove !== null}
        destructive
        title="ביטול רישום"
        message={pendingRemove ? `להסיר את "${pendingRemove.title}" מהיומן?` : ''}
        confirmLabel="הסרה"
        cancelLabel="השארה"
        onConfirm={() => {
          if (pendingRemove) removeLog(pendingRemove.id);
          setPendingRemove(null);
        }}
        onClose={() => setPendingRemove(null)}
      />
      {backfillOpen ? <BackfillSheet days={pending} onClose={() => setBackfillOpen(false)} /> : null}
      {habitsOpen ? <HabitEditorSheet onClose={() => setHabitsOpen(false)} /> : null}
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone: 'coral' | 'gold' | 'mint' }) {
  const cls = tone === 'coral' ? 'text-[#B4532A] bg-[#FFF0EA]' : tone === 'gold' ? 'text-[#7A5200] bg-[#FFF5DB]' : 'text-[#1E7A6D] bg-[#E3F4F1]';
  return <span className={`text-[12px] font-extrabold rounded-full px-2.5 py-1 ${cls}`}>{children}</span>;
}

function CoreTile(props: { title: string; tone: string; value: string; note: string; icon: IconName; progress?: number; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onPress}
      className="min-h-[116px] rounded-[20px] bg-white border border-[#DDE8EE] p-3.5 flex flex-col gap-1.5 text-right card-shadow"
    >
      <span className="flex flex-row items-center gap-1.5 text-[12px] font-extrabold" style={{ color: props.tone }}>
        <AppIcon name={props.icon} size={15} color={props.tone} />
        {props.title}
      </span>
      <span className="text-[17px] font-black text-[#17324D] leading-tight">{props.value}</span>
      {props.progress !== undefined ? <Bar value={Math.min(1, props.progress) * 100} max={100} color="#D9A21B" label={props.title} /> : null}
      <span className="text-[12px] text-[#5C6F82]">{props.note}</span>
    </button>
  );
}

function QuickChip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} className="min-h-[44px] px-4 rounded-full border border-[#DDE8EE] bg-white text-[13px] font-bold text-[#17324D]">
      {label}
    </button>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[20px] font-black text-[#17324D]">{value}</span>
      <span className="text-[11px] font-bold text-[#5C6F82]">{label}</span>
    </div>
  );
}
