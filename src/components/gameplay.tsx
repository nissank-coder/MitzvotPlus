import React, { useEffect, useState } from 'react';
import { AchievementView, ChallengeView } from '../lib/challenges';
import { HABIT_DOMAINS, HabitDomain, HABITS, habitById, habitSelectionOn } from '../lib/habits';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { Gender, HabitSelection } from '../types';
import { AppIcon } from './AppIcon';
import { ModalLayer } from './Modal';

/* ------------------------------- Habit picker ------------------------------- */

const FREQUENCIES = [
  { value: 7, label: 'כל יום' },
  { value: 5, label: '5 בשבוע' },
  { value: 3, label: '3 בשבוע' },
];
/** What the frequency means (S10-01): every day = part of the daily goal; otherwise weekly. */
const FREQ_NOTE = 'כל יום – חלק מהיעד היומי. 3 או 5 בשבוע – נמדד בשבוע, ולא נחשב חסר ביום שלא נעשה.';

/** Choose 1–5 habits (2–3 recommended) and how often. Used in onboarding and in "אני". */
export function HabitPicker({
  value,
  onChange,
  gender,
}: {
  value: HabitSelection[];
  onChange: (next: HabitSelection[]) => void;
  gender: Gender;
}) {
  const domains = Object.keys(HABIT_DOMAINS) as HabitDomain[];
  const selected = (id: string) => value.find((h) => h.id === id);
  const toggle = (id: string) => {
    if (selected(id)) onChange(value.filter((h) => h.id !== id));
    else if (value.length < 5) onChange([...value, { id, perWeek: 7 }]);
  };
  const setFreq = (id: string, perWeek: number) => onChange(value.map((h) => (h.id === id ? { ...h, perWeek } : h)));

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      {domains.map((domain) => {
        const meta = HABIT_DOMAINS[domain];
        const habits = HABITS.filter((h) => h.domain === domain && (!h.menOnly || gender === 'male'));
        return (
          <section key={domain} aria-label={meta.title}>
            <h3 className="text-[13px] font-black mb-2" style={{ color: meta.color }}>
              {meta.title}
            </h3>
            <div className="flex flex-col gap-2">
              {habits.map((h) => {
                const sel = selected(h.id);
                return (
                  <div
                    key={h.id}
                    className={`rounded-[18px] border bg-surface ${sel ? 'border-brand border-2 bg-brand-soft' : 'border-line'}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(h.id)}
                      aria-pressed={Boolean(sel)}
                      className="w-full min-h-[60px] flex flex-row items-center gap-3 px-3 text-right"
                    >
                      <span
                        className={`w-6 h-6 rounded-[7px] border-2 flex items-center justify-center shrink-0 ${sel ? 'bg-brand border-brand' : 'border-[#B8C4DA]'}`}
                      >
                        {sel ? <AppIcon name="check" size={14} color={colors.white} strokeWidth={3} /> : null}
                      </span>
                      <span className="flex-1 flex flex-col">
                        <span className="text-[15px] font-extrabold text-ink">
                          {h.title}
                          {h.private ? <span className="text-[11px] font-bold text-brand mr-2">· פרטי</span> : null}
                        </span>
                        <span className="text-[12px] text-ink-muted">{h.description}</span>
                      </span>
                    </button>
                    {sel ? <p className="px-3 pb-1 text-[11px] text-ink-muted">{FREQ_NOTE}</p> : null}
                    {sel ? (
                      <div className="flex flex-row gap-2 px-3 pb-3" role="radiogroup" aria-label={`תדירות: ${h.title}`}>
                        {FREQUENCIES.map((f) => (
                          <button
                            key={f.value}
                            type="button"
                            role="radio"
                            aria-checked={sel.perWeek === f.value}
                            onClick={() => setFreq(h.id, f.value)}
                            className={`flex-1 min-h-[44px] rounded-[12px] text-[12px] font-extrabold border ${
                              sel.perWeek === f.value ? 'bg-brand text-on-brand border-brand' : 'bg-surface text-ink border-line'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Modal sheet to edit habits from Home or "אני". */
export function HabitEditorSheet({ onClose }: { onClose: () => void }) {
  const { state, derived, setHabits } = useAppStore();
  // The whole choice in force today – weekly habits and those not due today included (round 13, U1).
  const [initial] = useState(() => habitSelectionOn(state.goalHistory, derived.todayKey).habits);
  const [value, setValue] = useState<HabitSelection[]>(initial);
  return (
    <ModalLayer
      label="ההרגלים שלי"
      onClose={onClose}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-[#0E1630]/45"
      panelClassName="w-full max-w-[460px] max-h-[88dvh] overflow-y-auto bg-canvas rounded-t-[28px] px-4 pt-5 pb-6"
    >
        <h2 className="text-[20px] font-black text-ink">ההרגלים שלי</h2>
        <p className="text-[13px] text-ink-muted mt-1 mb-4">
          מומלץ 2–3 הרגלים. שינוי חל מהיום והלאה – ההיסטוריה נשארת כפי שהייתה.
        </p>
        <HabitPicker value={value} onChange={setValue} gender={state.profile.gender} />
        <div className="sticky bottom-0 flex flex-row gap-2 pt-4 bg-canvas">
          <button type="button" onClick={onClose} className="flex-1 min-h-[50px] rounded-[16px] border border-line bg-white font-extrabold text-ink">
            ביטול
          </button>
          <button
            type="button"
            disabled={value.length === 0}
            onClick={() => {
              // "Save" without a change changes nothing (no new snapshot, the habit target is kept).
              if (JSON.stringify(value) !== JSON.stringify(initial)) setHabits(value);
              onClose();
            }}
            className="flex-[2] min-h-[50px] rounded-[16px] bg-brand disabled:bg-[#A9B3CC] text-white font-extrabold"
          >
            שמירה ({value.length} נבחרו)
          </button>
        </div>
    </ModalLayer>
  );
}

/* --------------------------------- Progress --------------------------------- */

export function Bar({ value, max, color = '#4FA300', label }: { value: number; max: number; color?: string; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-track overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemax={max} aria-label={label}>
      <div className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

/* -------------------------------- Challenges -------------------------------- */

const STATE_LABEL: Record<ChallengeView['state'], string> = { active: 'פעיל', completed: 'הושלם', expired: 'הסתיים', left: 'עזבת' };

export function ChallengeCard({ view, onLeave, compact }: { view: ChallengeView; onLeave?: () => void; compact?: boolean }) {
  const { def, value, target, state, daysLeft } = view;
  const active = state === 'active';
  return (
    <div dir="rtl" className="rounded-[22px] bg-white border border-line card-shadow p-4 flex flex-col gap-3">
      <div className="flex flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-extrabold text-brand">
            {active ? `אתגר פעיל · עוד ${daysLeft} ימים` : STATE_LABEL[state]}
            {def.private ? ' · פרטי' : ''}
          </span>
          <span className="text-[17px] font-black text-ink">{def.title}</span>
          {!compact ? <span className="text-[13px] text-ink-muted">{def.description}</span> : null}
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-black ${state === 'completed' ? 'bg-lime-soft text-lime-ink' : 'bg-brand-soft text-ink'}`}
        >
          {value}/{target}
        </span>
      </div>
      <Bar value={value} max={target} label={`${def.title}: ${value} מתוך ${target}`} />
      <span className="text-[12px] text-ink-muted">
        {state === 'completed'
          ? 'הושלם ונשמר'
          : active
            ? `${def.unit} נספרים מיום ההצטרפות · שבת וחג לא נחשבים חסרים`
            : `${value} ${def.unit} בתקופת האתגר`}
      </span>
      {active && onLeave ? (
        <button type="button" onClick={onLeave} className="self-start text-[12px] font-bold text-ink-muted underline min-h-[36px]">
          עזיבת האתגר
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------- Achievements ------------------------------- */

export function AchievementBadge({ view }: { view: AchievementView }) {
  const { def, value, earned } = view;
  const locked = !earned;
  return (
    <div dir="rtl" className="flex flex-col items-center text-center gap-1.5" aria-label={`${def.title}: ${earned ? 'הושג' : `${value} מתוך ${def.threshold}`}`}>
      <div
        className={`w-[58px] h-[58px] rounded-[18px] flex items-center justify-center ${
          def.future ? 'bg-canvas border border-dashed border-line' : locked ? 'bg-canvas border border-dashed border-[#B8C4DA]' : 'bg-lime-soft'
        }`}
      >
        <AppIcon name={earned ? 'trophy' : def.future ? 'community' : 'lock'} size={24} color={earned ? '#1E8C7C' : '#7D90A0'} />
      </div>
      <span className={`text-[11px] font-extrabold leading-tight ${locked ? 'text-ink-muted' : 'text-ink'}`}>{def.title}</span>
      <span className="text-[10px] text-ink-muted leading-tight">
        {def.future ? 'בגרסה הציבורית' : earned ? 'הושג' : `${value}/${def.threshold}`}
      </span>
    </div>
  );
}

/* ------------------------------- Celebration ------------------------------- */

/**
 * Quiet feedback after a SAVED change (design round 1). No confetti, no sound; respects reduced
 * motion; nothing waits for it. An entry can be undone right here ("ביטול") – the same removal as
 * in the day's list (an entry already sent becomes a deletion, never an edit).
 */
export function CelebrationToast() {
  const { celebration, dismissCelebration, removeLog } = useAppStore();
  // One timer per toast (its id): an achievement joining the toast, or any re-render of the app,
  // does not start it over (round 13, U4).
  const id = celebration?.id;
  const kind = celebration?.kind;
  useEffect(() => {
    if (id === undefined) return;
    const t = window.setTimeout(dismissCelebration, kind === 'saved' ? 4000 : 5000);
    return () => window.clearTimeout(t);
  }, [id, kind, dismissCelebration]);
  if (!celebration) return null;
  const strong = celebration.kind !== 'saved';
  return (
    <div className="fixed inset-x-0 bottom-[96px] z-40 flex justify-center px-4 pointer-events-none">
      <div
        key={celebration.id}
        role="status"
        dir="rtl"
        className={`pointer-events-auto max-w-[420px] w-full rounded-[18px] pr-3 pl-1.5 py-2 flex flex-row items-center gap-3 ds-shadow-strong animate-[toast_.2s_ease-out] motion-reduce:animate-none ${
          strong ? 'bg-brand text-on-brand' : 'bg-ink text-white'
        }`}
      >
        <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-lime" aria-hidden="true">
          <AppIcon name={celebration.kind === 'award' ? 'trophy' : 'check'} size={18} color="#172344" strokeWidth={2.8} />
        </span>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[14px] font-extrabold leading-snug line-clamp-2">{celebration.title}</span>
          {celebration.detail ? <span className="text-[12px] text-on-brand-muted">{celebration.detail}</span> : null}
        </span>
        {celebration.logIds && celebration.logIds.length > 0 ? (
          <button
            type="button"
            onClick={() => {
              // Exactly the entries this toast is about – never another one (round 1.1, R1).
              for (const id of celebration.logIds!) removeLog(id);
              dismissCelebration();
            }}
            aria-label={`ביטול הרישום: ${celebration.logTitle ?? ''}`}
            className="min-h-[44px] px-3 rounded-[12px] text-[14px] font-extrabold text-lime active:bg-white/10"
          >
            ביטול
          </button>
        ) : null}
        <button type="button" onClick={dismissCelebration} aria-label="סגירה" className="w-11 h-11 flex items-center justify-center rounded-full active:bg-white/10">
          <AppIcon name="close" size={16} color="#FFFFFF" />
        </button>
      </div>
    </div>
  );
}

export const habitIcon = (id: string) => habitById(id)?.icon ?? 'check';
