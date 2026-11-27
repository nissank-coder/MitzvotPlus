import React, { useEffect, useRef, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { BackfillSheet } from '../components/BackfillSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { needsMinyanChoice, useRecordFlow } from '../components/RecordFlow';
import { ChallengeCard, HabitEditorSheet } from '../components/gameplay';
import { Button, HabitMark, IconBadge, Meter, Num, Ring, SectionTitle, Surface } from '../components/ds';
import { UnsavedMark } from '../components/SaveStatusBanner';
import { TodayCard } from '../components/TodayCard';
import { TodayPlanCard } from '../components/TodayPlanCard';
import { ideaForDay, loadPracticalIdeas, PRACTICAL_CATEGORY, PracticalIdea } from '../content/practical';
import { DVAR_TORAH_AVAILABLE } from '../content/registry';
import { formatTime } from '../lib/dates';
import { habitById, recordPlan } from '../lib/habits';
import { useAppStore } from '../store/AppStore';
import { ds } from '../theme';
import { FeatureKey } from '../types';

type Props = {
  onOpenFeature: (feature: Exclude<FeatureKey, null>) => void;
  onOpenProfile: () => void;
  onOpenProgress: () => void;
  onOpenTracks: () => void;
  onQuickAdd: () => void;
};

/**
 * "היום" – design round 1 (26.11.2026, direction: active+), made compact in round 13 (review §5):
 * what did I do today (the chosen habits, one leading figure, partial progress), the one next step,
 * then – still on the first screen – blessings, learning and the speech guard; the habit rows,
 * the week and today's journal follow. Every number comes from the user's own log; points are
 * secondary, never the headline.
 *
 * Recording (round 13, U5): every entry point goes through the shared flow (RecordFlow) – a prayer
 * is never recorded without the minyan choice. The next-step button ignores a second tap for a
 * moment, so a double tap cannot record the habit that moves into its place.
 */
export function HomeScreen({ onOpenFeature, onOpenProfile, onOpenProgress, onOpenTracks, onQuickAdd }: Props) {
  const { state, derived, calendar, addAction, removeLog } = useAppStore();
  const { record, choose } = useRecordFlow();
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [allToday, setAllToday] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; title: string } | null>(null);
  const [ideas, setIdeas] = useState<PracticalIdea[]>([]);
  useEffect(() => {
    loadPracticalIdeas().then(setIdeas, () => setIdeas([]));
  }, []);

  const pending = calendar.pendingBackfill;
  const habits = derived.habitsToday;
  const target = derived.habitTarget;
  const done = derived.habitsDoneToday;
  const activeChallenge = derived.challenges.find((c) => c.state === 'active');
  const idea = ideaForDay(ideas, derived.todayKey, habits.map((h) => h.sel.id));
  const ideaTitle = idea ? `${habitById(idea.habit)?.title ?? ''}: רעיון היום` : '';
  const ideaDone = idea ? derived.todayLogs.some((l) => l.title === ideaTitle) : false;
  const firstDay = derived.totalCount === 0;
  const returning = derived.activityStreak === 0 && derived.totalCount > 0;
  const hour = calendar.now.getHours();
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';

  // Double tap on "הצעד הבא" (U5): for a moment after a tap the button keeps the habit that was
  // tapped and ignores further taps – the habit that moves into its place is not recorded.
  const [lockedNext, setLockedNext] = useState<string | null>(null);
  const lockRef = useRef(0);
  useEffect(() => {
    if (!lockedNext) return;
    const t = window.setTimeout(() => setLockedNext(null), NEXT_STEP_LOCK_MS);
    return () => window.clearTimeout(t);
  }, [lockedNext]);
  const nextHabit = lockedNext ? (habits.find((h) => h.sel.id === lockedNext) ?? habits.find((h) => !h.done)) : habits.find((h) => !h.done);

  // "I did it" never records something the user did not choose (S10-01): ambiguous habits ask
  // which prayer was said, a prayer asks "in a minyan or not", other habits open their screen.
  const recordHabit = (id: string) => {
    const plan = recordPlan(id);
    const def = habitById(id);
    if (!plan || !def) return;
    if (plan.kind === 'open') onOpenFeature(plan.feature);
    else if (plan.kind === 'choose') choose(def.title, plan.actions);
    else record(plan.action);
  };
  const tapNext = () => {
    if (!nextHabit) return onOpenTracks();
    if (Date.now() < lockRef.current) return;
    lockRef.current = Date.now() + NEXT_STEP_LOCK_MS;
    setLockedNext(nextHabit.sel.id);
    recordHabit(nextHabit.sel.id);
  };
  const weekGoalDays = derived.week.days.filter((d) => derived.progressContext.goalMet(d.key)).length;

  const headline = !derived.hasHabits
    ? null
    : target === 0
      ? 'היום אין הרגל יומי. ההרגלים שלך נמדדים בשבוע'
      : derived.todayGoalMet
        ? 'היעד של היום הושלם. יישר כוח'
        : firstDay
          ? 'מתחילים: מה כבר עשית היום?'
          : returning
            ? 'ברוך השב. כל יום הוא התחלה'
            : target - done === 1
              ? 'עוד הרגל אחד להשלמת היום'
              : `עוד ${target - done} הרגלים להשלמת היום`;
  const todayShown = allToday ? derived.todayLogs : derived.todayLogs.slice(0, TODAY_ROWS);

  return (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-3.5">
      {/* 1. Who and when */}
      <header className="flex flex-row items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <h1 className="text-[21px] font-extrabold text-ink leading-tight truncate">
            {greeting}, {state.userName}
          </h1>
          <span className="text-[13px] text-ink-muted">
            {calendar.day.hebrewDate}
            {calendar.day.parsha ? ` · ${calendar.day.parsha}` : ''}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="אני – פרופיל והגדרות"
          className="w-12 h-12 rounded-full bg-brand-soft text-brand font-extrabold text-[17px] shrink-0 border-2 border-surface"
        >
          {state.userName.slice(0, 1)}
        </button>
      </header>

      {pending.length > 0 ? (
        <button type="button" onClick={() => setBackfillOpen(true)} className="w-full rounded-[var(--radius-card)] bg-ink text-white px-4 py-3 flex flex-row items-center gap-3 text-right">
          <IconBadge name="flame" tone="onBrand" size={36} />
          <span className="flex-1 flex flex-col">
            <span className="text-[15px] font-extrabold">שבוע טוב! מה עשית ב{pending.length > 1 ? 'חג' : 'שבת'}?</span>
            <span className="text-[13px] text-on-brand-muted">רישום בדיעבד, בלי לחץ</span>
          </span>
          <AppIcon name="chevronLeft" size={20} color={ds.white} />
        </button>
      ) : null}

      {/* 2. The one leading figure – compact: the habits I chose, and the one next step */}
      {derived.hasHabits ? (
        <Surface tone="brand" as="section" aria-label="היעד שלי היום" className="p-4 flex flex-col gap-3 rounded-[var(--radius-hero)]">
          <div className="flex flex-row items-center gap-3.5">
            <Ring value={done} max={target} size={84} stroke={9} onBrand>
              <span className="num text-[24px] font-extrabold leading-none">
                {done}/{target}
              </span>
              <span className="text-[11px] font-bold text-on-brand-muted mt-0.5">הרגלים</span>
            </Ring>
            <div className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-[12px] font-bold text-on-brand-muted">היעד שלי היום</span>
              <span className="text-[17px] font-extrabold leading-snug">{headline}</span>
              <span className="flex flex-row flex-wrap items-center gap-x-3 text-[12px] text-on-brand-muted">
                <span className="flex flex-row items-center gap-1">
                  <span aria-hidden="true" className="w-2 h-2 rounded-full bg-lime" />
                  {derived.goalStreak > 0 ? `רצף ${derived.goalStreak} ימים` : 'רצף מתחיל היום'}
                </span>
                {derived.bestGoalStreak > 0 ? <span>שיא {derived.bestGoalStreak}</span> : null}
              </span>
            </div>
          </div>
          {nextHabit || !derived.todayGoalMet ? (
            <div className="rounded-[16px] bg-white/10 border border-white/15 px-3 py-2.5 flex flex-row items-center gap-3">
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[12px] font-bold text-on-brand-muted">הצעד הבא</span>
                <span className="text-[16px] font-extrabold truncate">
                  {nextHabit ? nextHabit.title : activeChallenge ? activeChallenge.def.title : 'אתגר קטן לשבוע'}
                </span>
                {nextHabit && nextHabit.needed > 1 ? (
                  <span className="flex flex-row items-center gap-2 mt-1">
                    <Meter value={nextHabit.value} max={nextHabit.needed} onBrand label={`הצעד הבא, ${nextHabit.title}: ${nextHabit.value} מתוך ${nextHabit.needed}`} className="flex-1 max-w-[120px]" thin />
                    <span className="text-[12px] text-on-brand-muted">
                      <Num>{Math.min(nextHabit.value, nextHabit.needed)}</Num> מתוך <Num>{nextHabit.needed}</Num>
                    </span>
                  </span>
                ) : null}
              </span>
              <Button
                variant="lime"
                icon={nextHabit && !lockedNext && actionLabel(nextHabit.sel.id, nextHabit.needed).plus ? 'plus' : undefined}
                onClick={tapNext}
                aria-disabled={lockedNext ? true : undefined}
                className={lockedNext ? 'pointer-events-none' : ''}
                aria-label={nextHabit ? `הצעד הבא – ${actionLabel(nextHabit.sel.id, nextHabit.needed).text}: ${nextHabit.title}` : 'בחירת אתגר'}
              >
                {lockedNext ? 'נרשם ✓' : nextHabit ? actionLabel(nextHabit.sel.id, nextHabit.needed).text : activeChallenge ? 'למסלולים' : 'בחירת אתגר'}
              </Button>
            </div>
          ) : null}
          {firstDay ? <p className="text-[12px] text-on-brand-muted">רושמים רק מה שכבר נעשה. כל רישום נשמר מיד במכשיר.</p> : null}
        </Surface>
      ) : (
        <Surface tone="brand" as="section" aria-label="היעד שלי היום" className="p-4 flex flex-col gap-3 rounded-[var(--radius-hero)]">
          <span className="text-[12px] font-bold text-on-brand-muted">היעד שלי היום</span>
          <span className="text-[19px] font-extrabold">
            <Num>{derived.todayCount}</Num> מתוך <Num>{state.dailyGoal}</Num> פעולות שונות
          </span>
          <Meter value={derived.todayCount} max={state.dailyGoal} onBrand label="יעד יומי" />
          <div className="rounded-[16px] bg-white/10 border border-white/15 p-3 flex flex-col gap-2">
            <span className="text-[15px] font-extrabold">חדש: יעד לפי 2–3 הרגלים שתבחר</span>
            <span className="text-[13px] text-on-brand-muted">ההיסטוריה והנקודות נשמרות. היעד החדש יחול מהיום.</span>
            <Button variant="lime" className="self-start" onClick={() => setHabitsOpen(true)}>
              בחירת הרגלים
            </Button>
          </div>
        </Surface>
      )}

      {/* 3. Direct access, on the first screen: blessings, learning / Dvar Torah, the speech guard */}
      <section aria-label="גישה מהירה" className="flex flex-col gap-2.5">
        <div className="rounded-[var(--radius-card)] bg-surface border border-line px-3.5 py-3 flex flex-row items-center gap-3">
          <button type="button" onClick={() => onOpenFeature('blessings')} className="flex-1 min-w-0 min-h-[48px] flex flex-row items-center gap-3 text-right" aria-label={`100 ברכות: ${derived.blessingTotal} מתוך ${state.blessingGoal}`}>
            <Ring value={derived.blessingTotal} max={state.blessingGoal} size={48} stroke={6}>
              <AppIcon name="cup" size={18} color={ds.brand} />
            </Ring>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-[12px] font-bold text-ink-muted">100 ברכות</span>
              <span className="text-[19px] font-extrabold text-ink leading-tight">
                <Num>{derived.blessingTotal}</Num>
                <span className="text-[14px] font-bold text-ink-muted">
                  {' '}
                  מתוך <Num>{state.blessingGoal}</Num>
                </span>
              </span>
            </span>
          </button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => record('blessing')} aria-label="+ ברכה – רישום ברכה אחת">
            ברכה
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {/* Round 1.1 (R4): the Dvar Torah is "done" only when the Dvar Torah itself was recorded –
              general learning does not mark it read. Without approved content the tile is learning. */}
          <CoreTile
            title={DVAR_TORAH_AVAILABLE ? 'דבר תורה' : 'לימוד יומי'}
            value={(DVAR_TORAH_AVAILABLE ? derived.torahCompletedToday : derived.learnedToday) ? 'נרשם היום' : DVAR_TORAH_AVAILABLE ? 'לקריאה' : 'ללימוד'}
            done={DVAR_TORAH_AVAILABLE ? derived.torahCompletedToday : derived.learnedToday}
            icon="book"
            onPress={() => onOpenFeature(DVAR_TORAH_AVAILABLE ? 'torah' : 'learning')}
          />
          <CoreTile title="שמירת הלשון" value="פרטי" icon="shield" privateTile onPress={() => onOpenFeature('speech')} />
          <CoreTile title="כל הפעולות" value="הוספה" icon="plus" onPress={onQuickAdd} />
        </div>
      </section>

      {/* 4. The habits as rows: what is done, what is open */}
      {derived.hasHabits ? (
        <Surface as="section" aria-label="ההרגלים שלי" className="px-4 pt-3 pb-1.5 flex flex-col shadow-none">
          <SectionTitle title="ההרגלים שלי" action="שינוי" onAction={() => setHabitsOpen(true)} />
          <ul className="flex flex-col">
            {habits.map((h) => {
              const label = actionLabel(h.sel.id, h.needed);
              return (
                <li key={h.sel.id} className="flex flex-row items-center gap-3 min-h-[56px] border-t border-line first:border-t-0">
                  <HabitMark title={h.title} value={h.value} needed={h.needed} done={h.done} />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="text-[15px] font-bold text-ink">{h.title}</span>
                    <span className="text-[13px] text-ink-muted">
                      {h.needed > 1 && !h.done ? (
                        <>
                          <Num>{Math.min(h.value, h.needed)}</Num> מתוך <Num>{h.needed}</Num>
                          {h.value > 0 ? ` · עוד ${h.needed - h.value}` : ''}
                        </>
                      ) : h.done ? (
                        'בוצע היום'
                      ) : (
                        'עוד לא נרשם'
                      )}
                      {h.sel.perWeek < 7 ? ` · ${h.sel.perWeek} בשבוע` : ''}
                    </span>
                  </span>
                  {!h.done ? (
                    <Button variant="secondary" size="sm" icon={label.plus ? 'plus' : undefined} onClick={() => recordHabit(h.sel.id)} aria-label={`${label.text}: ${h.title}`}>
                      {label.text}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {derived.weeklyHabits.length > 0 ? (
            <div className="mt-1 mb-2 rounded-[16px] bg-canvas p-3 flex flex-col gap-1">
              <span className="text-[12px] font-bold text-ink-muted">הרגלים שבועיים · לא חלק מהיעד היומי</span>
              {derived.weeklyHabits.map((h) => (
                <div key={h.sel.id} className="flex flex-row items-center gap-2 min-h-[48px]">
                  <span className="flex-1 text-[15px] font-bold text-ink">{h.title}</span>
                  <span className="num text-[13px] text-ink-muted">
                    {Math.min(h.daysThisWeek, h.perWeek)}/{h.perWeek} השבוע
                  </span>
                  {!h.doneToday ? (
                    <Button variant="secondary" size="sm" onClick={() => recordHabit(h.sel.id)} aria-label={`${actionLabel(h.sel.id, 1).text}: ${h.title}`}>
                      {actionLabel(h.sel.id, 1).text}
                    </Button>
                  ) : (
                    <span className="text-[13px] font-bold text-lime-ink">היום ✓</span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
          {derived.notDueToday.length > 0 ? (
            <span className="text-[13px] text-ink-muted pb-2">
              לא נדרש היום (שבת/חג): {derived.notDueToday.map((h) => habitById(h.id)?.title ?? h.id).join(', ')}
            </span>
          ) : null}
        </Surface>
      ) : null}

      {/* 5. The week, compact */}
      <Surface as="section" aria-label="השבוע שלי" className="p-4 flex flex-col gap-3 shadow-none">
        <SectionTitle title="השבוע שלי" action="התקדמות" onAction={onOpenProgress} />
        <div className="flex flex-row items-end gap-1.5" aria-hidden="true">
          {derived.week.days.map((d) => {
            const met = derived.progressContext.goalMet(d.key);
            const rest = !d.count && derived.progressContext.isRestDay(d.key);
            return (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5">
                <span
                  className={`w-full h-8 rounded-[10px] flex items-center justify-center ${
                    d.isFuture ? 'border border-dashed border-[#C3CDE0]' : met ? 'bg-lime' : d.count > 0 ? 'bg-brand-soft border border-brand-line' : rest ? 'bg-canvas' : 'bg-track'
                  }`}
                >
                  {met ? <AppIcon name="check" size={16} color={ds.ink} strokeWidth={3} /> : rest && !d.isFuture ? <span className="text-[11px] text-ink-muted">מנוחה</span> : null}
                </span>
                <span className={`text-[12px] ${d.isToday ? 'font-extrabold text-brand' : 'font-bold text-ink-muted'}`}>{d.label}</span>
              </div>
            );
          })}
        </div>
        <p className="text-[13px] text-ink-muted leading-5">
          <Num>{weekGoalDays}</Num> ימי יעד השבוע · ✓ היעד הושלם · כחול: יש רישום · שבת וחג אינם חסרים
        </p>
      </Surface>

      {/* 6. At most one suggestion: the active challenge, or one to join */}
      {activeChallenge ? (
        <button type="button" onClick={onOpenTracks} className="text-right" aria-label={`האתגר הפעיל: ${activeChallenge.def.title}`}>
          <ChallengeCard view={activeChallenge} compact />
        </button>
      ) : derived.joinableChallenges.length > 0 ? (
        <Surface className="p-4 flex flex-row items-center gap-3 shadow-none">
          <IconBadge name="target" tone="lime" />
          <div className="flex-1 min-w-0 flex flex-col">
            <span className="text-[12px] font-bold text-ink-muted">אתגר מוצע לשבוע</span>
            <span className="text-[15px] font-extrabold text-ink">{derived.joinableChallenges[0]!.title}</span>
            <span className="text-[13px] text-ink-muted">{derived.joinableChallenges[0]!.description}</span>
          </div>
          <Button variant="secondary" size="sm" onClick={onOpenTracks}>
            למסלולים
          </Button>
        </Surface>
      ) : null}

      {/* 7. What was recorded today – every entry reachable for a correction (U6), with undo here */}
      <Surface as="section" aria-label="נרשם היום" className="px-4 pt-3 pb-2 flex flex-col shadow-none">
        <SectionTitle title="נרשם היום" action={derived.todayLogs.length > 0 ? 'כל ההיסטוריה' : undefined} onAction={onOpenProgress} />
        {derived.todayLogs.length === 0 ? (
          <div className="py-3 flex flex-col gap-3">
            <p className="text-[14px] text-ink-muted">עוד לא נרשם דבר היום. פעולה אחת מספיקה כדי להתחיל.</p>
            <Button variant="primary" icon="plus" className="self-start" onClick={onQuickAdd}>
              רישום פעולה ראשונה
            </Button>
          </div>
        ) : (
          <ul className="flex flex-col">
            {todayShown.map((log) => (
              <li key={log.id} className="flex flex-row items-center gap-2 min-h-[52px] border-t border-line first:border-t-0">
                <span className="flex-1 min-w-0 text-[15px] font-bold text-ink truncate">
                  {log.title} <UnsavedMark logId={log.id} />
                </span>
                <span className="num text-[13px] text-ink-muted">{formatTime(log.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => setPendingRemove({ id: log.id, title: log.title })}
                  aria-label={`ביטול: ${log.title}`}
                  className="w-11 h-11 rounded-full flex items-center justify-center active:bg-canvas"
                >
                  <AppIcon name="close" size={16} color={ds.inkMuted} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {derived.todayLogs.length > TODAY_ROWS ? (
          <Button variant="ghost" size="sm" className="self-start" aria-expanded={allToday} onClick={() => setAllToday((v) => !v)}>
            {allToday ? 'פחות' : `הצגת כל ${derived.todayLogs.length} הרישומים של היום`}
          </Button>
        ) : null}
        {derived.todayLogs.length > 0 ? (
          <p className="text-[12px] text-ink-muted pb-2">
            <Num>{derived.todayPoints}</Num> נקודות התמדה היום · <Num>{derived.todayEntries}</Num> רישומים
          </p>
        ) : null}
      </Surface>

      {/* Practical idea – only approved content in production; drafts only in internal builds */}
      {idea ? (
        <Surface className={`p-4 flex flex-col gap-2 shadow-none ${idea.status === 'DRAFT' ? 'border-dashed' : ''}`}>
          <div className="flex flex-row items-center justify-between gap-2">
            <span className="text-[12px] font-bold text-ink-muted">רעיון מעשי ליום · {PRACTICAL_CATEGORY[idea.category]}</span>
            {idea.status === 'DRAFT' ? <span className="text-[11px] font-bold text-amber-ink bg-amber-soft rounded px-2 py-0.5">טיוטה פנימית · לא מאושר</span> : null}
          </div>
          <p className="text-[15px] font-bold text-ink leading-6">{idea.text}</p>
          <Button
            variant={ideaDone ? 'ghost' : 'secondary'}
            size="sm"
            className="self-start"
            disabled={ideaDone}
            onClick={() => {
              const def = habitById(idea.habit);
              if (def && def.logAction !== 'blessing') addAction(def.logAction, { title: ideaTitle });
            }}
          >
            {ideaDone ? 'נרשם ✓' : 'עשיתי'}
          </Button>
        </Surface>
      ) : null}

      {/* Tools: zmanim, siddur, the calendar checklist */}
      <Surface className="overflow-hidden shadow-none">
        <button
          type="button"
          onClick={() => setToolsOpen((v) => !v)}
          aria-expanded={toolsOpen}
          className="w-full min-h-[56px] px-4 flex flex-row items-center gap-3 text-right"
        >
          <IconBadge name="calendar" tone="muted" size={36} />
          <span className="flex-1 text-[15px] font-bold text-ink">זמנים, סידור ומצוות היום לפי הלוח</span>
          <AppIcon name={toolsOpen ? 'chevronUp' : 'chevronDown'} size={18} color={ds.inkMuted} />
        </button>
        {toolsOpen ? (
          <div className="px-3 pb-3 flex flex-col gap-3">
            <div className="flex flex-row flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => onOpenFeature('siddur')}>סידור</Button>
              <Button variant="secondary" size="sm" onClick={() => onOpenFeature('tehillim')}>תהילים</Button>
              <Button variant="secondary" size="sm" onClick={() => onOpenFeature('prayers')}>זמני תפילה</Button>
              <Button variant="secondary" size="sm" onClick={() => onOpenFeature('blessingGuide')}>איזו ברכה?</Button>
            </div>
            <TodayCard onOpenZmanim={() => onOpenFeature('prayers')} />
            <TodayPlanCard />
          </div>
        ) : null}
      </Surface>

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

/** A tap on "הצעד הבא" holds the tapped habit this long: a double tap records it once (U5). */
const NEXT_STEP_LOCK_MS = 900;
/** Today's journal on Home: the newest rows, the rest one tap away (U6). */
const TODAY_ROWS = 5;

/**
 * The words of a habit's record button say what it opens (review §5): a prayer habit "רישום
 * תפילה", a habit of several entries "עוד אחת", a habit with its own screen "פתיחה", else "רשמתי".
 */
function actionLabel(habitId: string, needed: number): { text: string; plus: boolean } {
  const plan = recordPlan(habitId);
  if (plan?.kind === 'choose' || (plan?.kind === 'log' && needsMinyanChoice(plan.action))) return { text: 'רישום תפילה', plus: needed > 1 };
  if (plan?.kind === 'open') return { text: 'פתיחה', plus: false };
  if (needed > 1) return { text: plan?.kind === 'log' && plan.action === 'blessing' ? 'עוד ברכה' : 'עוד אחת', plus: true };
  return { text: 'רשמתי', plus: false };
}

function CoreTile(props: { title: string; value: string; icon: 'book' | 'shield' | 'plus'; done?: boolean; privateTile?: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onPress}
      aria-label={`${props.title}: ${props.value}`}
      className="min-h-[96px] rounded-[var(--radius-card)] bg-surface border border-line p-3 flex flex-col items-start gap-1.5 text-right active:bg-brand-soft"
    >
      <IconBadge name={props.done ? 'check' : props.icon} tone={props.done ? 'lime' : 'brand'} size={34} />
      <span className="text-[14px] font-extrabold text-ink leading-tight">{props.title}</span>
      {props.privateTile ? (
        <span className="flex flex-row items-center gap-1 text-[12px] font-bold text-brand">
          <AppIcon name="lock" size={13} color={ds.brand} strokeWidth={2} />
          פרטי
        </span>
      ) : (
        <span className={`text-[12px] font-bold ${props.done ? 'text-lime-ink' : 'text-ink-muted'}`}>{props.value}</span>
      )}
    </button>
  );
}

