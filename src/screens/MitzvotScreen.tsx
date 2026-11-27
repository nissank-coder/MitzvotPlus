import React, { useMemo, useState } from 'react';
import { Button, Num, ScreenHeader, SectionTitle, Surface } from '../components/ds';
import { useRecordFlow } from '../components/RecordFlow';
import { Chip } from '../components/ui';
import { actionDef } from '../data/actions';
import { DOING, MitzvahEntry, mitzvahOfDay, mitzvot, reviewOf } from '../data/mitzvot';
import { useAppStore } from '../store/AppStore';

type Props = { onBack: () => void; onOpenProfile: () => void };
type Filter = 'all' | 'aseh' | 'lav' | 'constant' | 'unlearned';

const filters: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'הכל' },
  { key: 'aseh', label: 'מצוות עשה' },
  { key: 'lav', label: 'לא תעשה' },
  { key: 'constant', label: 'שש התמידיות' },
  { key: 'unlearned', label: 'עוד לא למדתי' },
];

/**
 * ספריית מצוות (round 14; title 14.1 – no "of 613" without an approved mapping). Said at the top: a current selection of N entries, not the
 * whole 613, and their texts await review. Learning about a mitzvah ("למדתי על המצווה") and doing it
 * ("רישום עשייה", the app's own entry for it, when there is one) are two separate actions.
 */
export function MitzvotScreen({ onBack }: Props) {
  const { state, derived, addAction } = useAppStore();
  const { record } = useRecordFlow();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const today = mitzvahOfDay(derived.todayKey);

  const learned = useMemo(() => new Set(state.logs.filter((l) => l.actionKey === 'mitzvahStudy').map((l) => l.refId)), [state.logs]);
  const learnedToday = new Set(derived.todayLogs.filter((l) => l.actionKey === 'mitzvahStudy').map((l) => l.refId));
  const pending = mitzvot.filter((m) => reviewOf(m) === 'PENDING_REVIEW').length;
  // Coverage of the 613 is counted only from an APPROVED mapping to one counting method (round 14.1).
  const mapped = mitzvot.filter((m) => m.count && reviewOf(m) === 'APPROVED').length;

  const list = mitzvot.filter((m) => {
    if (filter === 'aseh') return m.type === 'aseh';
    if (filter === 'lav') return m.type === 'lav';
    if (filter === 'constant') return m.constant;
    if (filter === 'unlearned') return !learned.has(m.id);
    return true;
  });

  const learn = (m: MitzvahEntry) => addAction('mitzvahStudy', { refId: m.id, title: `למדתי: ${m.title}` });
  // The deed is the app's own action: recorded here or in the add sheet, it is the same entry with the
  // same rules – an action recorded once a day shows as done here too, so it is never recorded twice.
  const doneToday = (key: string) => Boolean(actionDef(key).oncePerDay) && derived.todayLogs.some((l) => l.actionKey === key);

  return (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-4">
      <ScreenHeader title="ספריית מצוות" subtitle={`למדת ${learned.size} מתוך ${mitzvot.length} הפריטים הזמינים`} onBack={onBack} />

      {/* What this is – at the top, not at the bottom */}
      <div className="rounded-[var(--radius-card)] bg-amber-soft px-4 py-3 flex flex-col gap-1" role="note" data-testid="mitzvot-scope">
        <span className="text-[15px] font-extrabold text-amber-ink">
          מבחר מצוות ללימוד: <Num>{mitzvot.length}</Num> פריטים זמינים
        </span>
        <span className="text-[13px] leading-5 text-ink">
          מצוות הנוגעות לחיי היום-יום, ולא רשימת תרי״ג מלאה.{' '}
          {mapped > 0 ? `${mapped} מהם ממופים למניין הרמב״ם. ` : 'הפריטים עוד לא ממופים לשיטת מניין מאושרת. '}
          ההסברים קצרים ו{pending === mitzvot.length ? 'כולם' : `${pending} מהם`} ממתינים לבדיקה. בכל שאלה למעשה – לשאול רב.
        </span>
      </div>

      <Surface as="section" aria-label="המצווה של היום" className="p-4 flex flex-col gap-3 shadow-none">
        <SectionTitle title="המצווה של היום" />
        <MitzvahDetails m={today} />
        <LearnDo m={today} learnedToday={learnedToday.has(today.id)} doneToday={doneToday} onLearn={() => learn(today)} onDo={(k) => record(k)} />
      </Surface>

      <div className="flex flex-row gap-2 overflow-x-auto no-scrollbar pb-1">
        {filters.map((f) => (
          <Chip key={f.key} active={filter === f.key} onPress={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <Surface as="section" aria-label="רשימת המצוות" className="px-4 py-1 shadow-none">
        {list.map((m, i) => {
          const isOpen = open === m.id;
          return (
            <div key={m.id} className={`py-2 ${i < list.length - 1 ? 'border-b border-line' : ''}`}>
              <button type="button" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen} className="w-full min-h-[44px] flex flex-row items-center gap-3 text-right">
                <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${learned.has(m.id) ? 'bg-lime-deep' : 'bg-line'}`} />
                <span className="flex-1 text-ink text-[15px] font-bold">{m.title}</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${m.type === 'aseh' ? 'bg-brand-soft text-brand' : 'bg-danger-soft text-danger'}`}>
                  {m.type === 'aseh' ? 'עשה' : 'לא תעשה'}
                </span>
              </button>
              {isOpen ? (
                <div className="mt-1 mb-2 mr-5 flex flex-col gap-2">
                  <MitzvahDetails m={m} />
                  <LearnDo m={m} learnedToday={learnedToday.has(m.id)} doneToday={doneToday} onLearn={() => learn(m)} onDo={(k) => record(k)} compact />
                </div>
              ) : null}
            </div>
          );
        })}
      </Surface>
    </div>
  );
}

/** Learning about it and doing it – two different entries, said in words. */
function LearnDo({ m, learnedToday, doneToday, onLearn, onDo, compact }: { m: MitzvahEntry; learnedToday: boolean; doneToday: (key: string) => boolean; onLearn: () => void; onDo: (key: NonNullable<(typeof DOING)[string]>) => void; compact?: boolean }) {
  const doing = DOING[m.id];
  const did = doing ? doneToday(doing) : false;
  return (
    <div className="flex flex-row flex-wrap gap-2">
      <Button variant={compact ? 'secondary' : 'primary'} size={compact ? 'sm' : 'md'} icon={learnedToday ? 'check' : 'book'} disabled={learnedToday} onClick={onLearn} aria-label={`למדתי על המצווה: ${m.title}`}>
        {learnedToday ? 'הלימוד נרשם היום' : 'למדתי על המצווה'}
      </Button>
      {doing ? (
        <Button variant="ghost" size={compact ? 'sm' : 'md'} icon={did ? 'check' : 'plus'} disabled={did} onClick={() => onDo(doing)} aria-label={did ? `${actionDef(doing).title} – נרשם היום` : `רישום עשייה: ${actionDef(doing).title}`}>
          {did ? `${actionDef(doing).title} – נרשם היום` : `רישום עשייה: ${actionDef(doing).title}`}
        </Button>
      ) : null}
    </div>
  );
}

function MitzvahDetails({ m }: { m: MitzvahEntry }) {
  return (
    <div>
      <p className="text-ink text-[17px] font-extrabold">{m.title}</p>
      <p className="text-ink-muted text-[12px] font-bold mt-0.5">
        {m.type === 'aseh' ? 'מצוות עשה' : 'מצוות לא תעשה'} · מקור: {m.source}
        {m.applies === 'men' ? ' · חלה על גברים' : ''}
        {m.count && reviewOf(m) === 'APPROVED' ? ` · ${m.type === 'lav' ? 'ל״ת' : 'עשה'} ${m.count.number} בספר המצוות לרמב״ם` : ''}
        {reviewOf(m) === 'PENDING_REVIEW' ? ' · ממתין לבדיקה' : ''}
      </p>
      <p className="text-ink text-[15px] leading-6 mt-2">{m.summary}</p>
      <p className="text-ink text-[14px] leading-6 mt-1">
        <span className="font-bold text-brand">בפועל: </span>
        {m.practice}
      </p>
      {m.expanded ? <p className="text-ink text-[14px] leading-6 mt-1">{m.expanded}</p> : null}
    </div>
  );
}
