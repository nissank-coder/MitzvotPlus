import React, { useEffect, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { BackfillSheet } from '../components/BackfillSheet';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ChallengeCard, HabitEditorSheet } from '../components/gameplay';
import { Button, CheckMark, IconBadge, Meter, Num, Ring, SectionTitle, Surface } from '../components/ds';
import { UnsavedMark } from '../components/SaveStatusBanner';
import { TodayCard } from '../components/TodayCard';
import { TodayPlanCard } from '../components/TodayPlanCard';
import { ideaForDay, loadPracticalIdeas, PRACTICAL_CATEGORY, PracticalIdea } from '../content/practical';
import { DVAR_TORAH_AVAILABLE } from '../content/registry';
import { formatTime } from '../lib/dates';
import { habitById, recordPlan } from '../lib/habits';
import { ActionKey, actionDef } from '../data/actions';
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
 * "היום" – design round 1 (26.11.2026, direction: active+). Three questions, in this order:
 * what did I do today (one leading figure: the chosen habits), what is the next step (one primary
 * action), how is my week going (a compact week strip). Blessings, Dvar Torah / learning and the
 * speech guard are one tap away; history, achievements and tools live on secondary screens.
 * Every number comes from the user's own log; points are secondary, never the headline.
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
  const firstDay = derived.totalCount === 0;
  const returning = derived.activityStreak === 0 && derived.totalCount > 0;
  const hour = calendar.now.getHours();
  const greeting = hour < 12 ? 'בוקר טוב' : hour < 17 ? 'צהריים טובים' : 'ערב טוב';
  // "I did it" never records something the user did not choose (S10-01): ambiguous habits ask
  // which prayer was said, or open the screen where the exact item is recorded.
  const [choose, setChoose] = useState<{ title: string; actions: ActionKey[] } | null>(null);
  const recordHabit = (id: string) => {
    const plan = recordPlan(id);
    const def = habitById(id);
    if (!plan || !def) return;
    if (plan.kind === 'open') onOpenFeature(plan.feature);
    else if (plan.kind === 'choose') setChoose({ title: def.title, actions: plan.actions });
    else if (plan.action === 'blessing') addBlessing('other');
    else addAction(plan.action);
  };
  const doneToday = new Set(derived.todayLogs.map((l) => l.actionKey));
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

  return (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-4">
      {/* 1. Who and when */}
      <header className="flex flex-row items-center justify-between gap-3">
        <div className="flex flex-col min-w-0">
          <h1 className="text-[22px] font-extrabold text-ink leading-tight truncate">
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
          className="w-12 h-12 rounded-full bg-brand-soft text-brand font-extrabold text-[17px] shrink-0 border-2 border-surface ds-shadow"
        >
          {state.userName.slice(0, 1)}
        </button>
      </header>

      {pending.length > 0 ? (
        <button type="button" onClick={() => setBackfillOpen(true)} className="w-full rounded-[var(--radius-card)] bg-ink text-white p-4 flex flex-row items-center gap-3 text-right">
          <IconBadge name="flame" tone="onBrand" />
          <span className="flex-1 flex flex-col">
            <span className="text-[15px] font-extrabold">שבוע טוב! מה עשית ב{pending.length > 1 ? 'חג' : 'שבת'}?</span>
            <span className="text-[13px] text-on-brand-muted">רישום בדיעבד, בלי לחץ</span>
          </span>
          <AppIcon name="chevronLeft" size={20} color={ds.white} />
        </button>
      ) : null}

      {/* 2. The one leading figure: the habits I chose, and the one next step */}
      {derived.hasHabits ? (
        <Surface tone="brand" as="section" aria-label="היעד שלי היום" className="p-5 flex flex-col gap-4 rounded-[var(--radius-hero)]">
          <div className="flex flex-row items-center gap-4">
            <Ring value={done} max={target} size={112} stroke={11} onBrand>
              <span className="num text-[30px] font-extrabold leading-none">
                {done}/{target}
              </span>
              <span className="text-[12px] font-bold text-on-brand-muted mt-1">הרגלים</span>
            </Ring>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <span className="text-[13px] font-bold text-on-brand-muted">היעד שלי היום</span>
              <span className="text-[19px] font-extrabold leading-snug">{headline}</span>
              <span className="flex flex-row flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-on-brand-muted">
                <span className="flex flex-row items-center gap-1">
                  <span aria-hidden="true" className="w-2 h-2 rounded-full bg-lime" />
                  {derived.goalStreak > 0 ? `רצף ${derived.goalStreak} ימים` : 'רצף מתחיל היום'}
                </span>
                {derived.bestGoalStreak > 0 ? <span>שיא {derived.bestGoalStreak}</span> : null}
              </span>
            </div>
          </div>
          {nextHabit || !derived.todayGoalMet ? (
            <div className="rounded-[18px] bg-white/10 border border-white/15 p-3 flex flex-row items-center gap-3">
              <span className="flex-1 min-w-0 flex flex-col">
                <span className="text-[12px] font-bold text-on-brand-muted">הצעד הבא</span>
                <span className="text-[16px] font-extrabold truncate">
                  {nextHabit ? nextHabit.title : activeChallenge ? activeChallenge.def.title : 'אתגר קטן לשבוע'}
                </span>
              </span>
              <Button
                variant="lime"
                onClick={() => (nextHabit ? recordHabit(nextHabit.sel.id) : onOpenTracks())}
                aria-label={nextHabit ? `הצעד הבא – רשמתי: ${nextHabit.title}` : 'בחירת אתגר'}
              >
                {nextHabit ? 'רשמתי' : activeChallenge ? 'למסלולים' : 'בחירת אתגר'}
              </Button>
            </div>
          ) : null}
          <p className="text-[12px] text-on-brand-muted">רושמים רק מה שכבר נעשה. כל רישום נשמר מיד במכשיר.</p>
        </Surface>
      ) : (
        <Surface tone="brand" as="section" aria-label="היעד שלי היום" className="p-5 flex flex-col gap-3 rounded-[var(--radius-hero)]">
          <span className="text-[13px] font-bold text-on-brand-muted">היעד שלי היום</span>
          <span className="text-[20px] font-extrabold">
            <Num>{derived.todayCount}</Num> מתוך <Num>{state.dailyGoal}</Num> פעולות שונות
          </span>
          <Meter value={derived.todayCount} max={state.dailyGoal} onBrand label="יעד יומי" />
          <div className="rounded-[18px] bg-white/10 border border-white/15 p-3 flex flex-col gap-2">
            <span className="text-[15px] font-extrabold">חדש: יעד לפי 2–3 הרגלים שתבחר</span>
            <span className="text-[13px] text-on-brand-muted">ההיסטוריה והנקודות נשמרות. היעד החדש יחול מהיום.</span>
            <Button variant="lime" className="self-start" onClick={() => setHabitsOpen(true)}>
              בחירת הרגלים
            </Button>
          </div>
        </Surface>
      )}

      {/* The habits as rows: what is done, what is open */}
      {derived.hasHabits ? (
        <Surface as="section" aria-label="ההרגלים שלי" className="px-4 pt-3 pb-2 flex flex-col">
          <SectionTitle title="ההרגלים שלי" action="שינוי" onAction={() => setHabitsOpen(true)} />
          <ul className="flex flex-col">
            {habits.map((h) => (
              <li key={h.sel.id} className="flex flex-row items-center gap-3 min-h-[60px] border-t border-line first:border-t-0">
                <CheckMark done={h.done} />
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[15px] font-bold text-ink">{h.title}</span>
                  <span className="text-[13px] text-ink-muted">
                    {h.needed > 1 ? (
                      <>
                        <Num>{Math.min(h.value, h.needed)}</Num> מתוך <Num>{h.needed}</Num>
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
                  <Button variant="secondary" size="sm" icon={h.needed > 1 ? 'plus' : undefined} onClick={() => recordHabit(h.sel.id)} aria-label={`רשמתי: ${h.title}`}>
                    {h.needed > 1 ? 'עוד אחת' : 'רשמתי'}
                  </Button>
                ) : null}
              </li>
            ))}
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
                    <Button variant="secondary" size="sm" onClick={() => recordHabit(h.sel.id)} aria-label={`רשמתי: ${h.title}`}>
                      רשמתי
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

      {/* 3. Direct access: blessings, Dvar Torah / learning, the speech guard */}
      <section aria-label="גישה מהירה" className="grid grid-cols-3 gap-2.5">
        <div className="col-span-3 rounded-[var(--radius-card)] bg-surface border border-line ds-shadow p-4 flex flex-row items-center gap-3">
          <button type="button" onClick={() => onOpenFeature('blessings')} className="flex-1 min-w-0 flex flex-row items-center gap-3 text-right" aria-label={`100 ברכות: ${derived.blessingTotal} מתוך ${state.blessingGoal}`}>
            <Ring value={derived.blessingTotal} max={state.blessingGoal} size={58} stroke={7}>
              <AppIcon name="cup" size={20} color={ds.brand} />
            </Ring>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-[13px] font-bold text-ink-muted">100 ברכות</span>
              <span className="text-[20px] font-extrabold text-ink leading-tight">
                <Num>{derived.blessingTotal}</Num>
                <span className="text-[14px] font-bold text-ink-muted">
                  {' '}
                  מתוך <Num>{state.blessingGoal}</Num>
                </span>
              </span>
            </span>
          </button>
          <Button variant="primary" size="sm" icon="plus" onClick={() => addBlessing('other')} aria-label="+ ברכה – רישום ברכה אחת">
            ברכה
          </Button>
        </div>
        <CoreTile
          title={DVAR_TORAH_AVAILABLE ? 'דבר תורה' : 'לימוד יומי'}
          value={derived.learnedToday ? 'נלמד היום' : 'לקריאה'}
          done={derived.learnedToday}
          icon="book"
          onPress={() => onOpenFeature(DVAR_TORAH_AVAILABLE ? 'torah' : 'learning')}
        />
        <CoreTile title="שמירת הלשון" value="פרטי" icon="shield" privateTile onPress={() => onOpenFeature('speech')} />
        <CoreTile title="כל הפעולות" value="הוספה" icon="plus" onPress={onQuickAdd} />
      </section>

      {/* 4. The week, compact */}
      <Surface as="section" aria-label="השבוע שלי" className="p-4 flex flex-col gap-3">
        <SectionTitle title="השבוע שלי" action="התקדמות" onAction={onOpenProgress} />
        <div className="flex flex-row items-end gap-1.5" aria-hidden="true">
          {derived.week.days.map((d) => {
            const met = derived.progressContext.goalMet(d.key);
            const rest = !d.count && derived.progressContext.isRestDay(d.key);
            return (
              <div key={d.key} className="flex-1 flex flex-col items-center gap-1.5">
                <span
                  className={`w-full h-9 rounded-[10px] flex items-center justify-center ${
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
          <Num>{weekGoalDays}</Num> ימי יעד השבוע. ✓ יום שבו הושלם היעד · כחול בהיר: יש רישום · שבת וחג לא נספרים כחסרים.
        </p>
      </Surface>

      {/* 5. At most one suggestion: the active challenge, or one to join */}
      {activeChallenge ? (
        <button type="button" onClick={onOpenTracks} className="text-right" aria-label={`האתגר הפעיל: ${activeChallenge.def.title}`}>
          <ChallengeCard view={activeChallenge} compact />
        </button>
      ) : derived.joinableChallenges.length > 0 ? (
        <Surface className="p-4 flex flex-row items-center gap-3">
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

      {/* What was recorded today – with undo right here */}
      <Surface as="section" aria-label="נרשם היום" className="px-4 pt-3 pb-2 flex flex-col">
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
            {derived.todayLogs.slice(0, 5).map((log) => (
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
        {derived.todayLogs.length > 0 ? (
          <p className="text-[12px] text-ink-muted pb-2">
            <Num>{derived.todayPoints}</Num> נקודות התמדה היום · <Num>{derived.todayEntries}</Num> רישומים
          </p>
        ) : null}
      </Surface>

      {/* Practical idea – only approved content in production; drafts only in internal builds */}
      {idea ? (
        <Surface className={`p-4 flex flex-col gap-2 ${idea.status === 'DRAFT' ? 'border-dashed' : ''}`}>
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
      <Surface className="overflow-hidden">
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
      {choose ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0E1630]/45" onClick={() => setChoose(null)}>
          <div
            role="dialog"
            aria-label={`איזו תפילה? ${choose.title}`}
            className="w-full max-w-[460px] bg-surface rounded-t-[28px] px-4 pt-3 sheet-safe flex flex-col gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <span aria-hidden="true" className="w-12 h-[5px] rounded-full bg-line mx-auto mb-2" />
            <h2 className="text-[19px] font-extrabold text-ink">איזו תפילה התפללת?</h2>
            <p className="text-[14px] text-ink-muted mb-1">נרשם רק מה שבחרת.</p>
            {choose.actions.map((a) => {
              const isDone = doneToday.has(a);
              return (
                <button
                  key={a}
                  type="button"
                  disabled={isDone}
                  onClick={() => {
                    addAction(a);
                    setChoose(null);
                  }}
                  className={`min-h-[56px] rounded-[16px] border text-[16px] font-bold text-right px-4 flex flex-row items-center gap-3 ${
                    isDone ? 'bg-lime-soft text-lime-ink border-transparent' : 'bg-surface text-ink border-line active:bg-brand-soft'
                  }`}
                >
                  <span className="flex-1">{actionDef(a).title}</span>
                  {isDone ? <span className="text-[13px]">נרשם היום ✓</span> : <AppIcon name="chevronLeft" size={18} color={ds.brand} />}
                </button>
              );
            })}
            <Button variant="ghost" onClick={() => setChoose(null)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CoreTile(props: { title: string; value: string; icon: 'book' | 'shield' | 'plus'; done?: boolean; privateTile?: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onPress}
      aria-label={`${props.title}: ${props.value}`}
      className="min-h-[112px] rounded-[var(--radius-card)] bg-surface border border-line ds-shadow p-3 flex flex-col items-start gap-2 text-right active:bg-brand-soft"
    >
      <IconBadge name={props.done ? 'check' : props.icon} tone={props.done ? 'lime' : 'brand'} size={38} />
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

