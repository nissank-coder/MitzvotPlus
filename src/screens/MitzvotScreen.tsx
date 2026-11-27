import React, { useMemo, useState } from 'react';
import { Button, Num, ScreenHeader, SectionTitle, Surface } from '../components/ds';
import { useRecordFlow } from '../components/RecordFlow';
import { Chip } from '../components/ui';
import { actionDef } from '../data/actions';
import { DOING, MitzvahEntry, mitzvahOfDay, mitzvot, MITZVOT_TOTAL, reviewOf } from '../data/mitzvot';
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
 * תרי״ג מצוות (round 14, review v4 §4). Said at the top: a current selection of N entries, not the
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

  const list = mitzvot.filter((m) => {
    if (filter === 'aseh') return m.type === 'aseh';
    if (filter === 'lav') return m.type === 'lav';
    if (filter === 'constant') return m.constant;
    if (filter === 'unlearned') return !learned.has(m.id);
    return true;
  });

  const learn = (m: MitzvahEntry) => addAction('mitzvahStudy', { refId: m.id, title: `למדתי: ${m.title}` });

  return (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-10 pt-3 flex flex-col gap-4">
      <ScreenHeader title="תרי״ג מצוות" subtitle={`למדת ${learned.size} מתוך ${mitzvot.length} הערכים הזמינים`} onBack={onBack} />

      {/* What this is – at the top, not at the bottom */}
      <div className="rounded-[var(--radius-card)] bg-amber-soft px-4 py-3 flex flex-col gap-1" role="note" data-testid="mitzvot-scope">
        <span className="text-[15px] font-extrabold text-amber-ink">
          מצוות נבחרות: <Num>{mitzvot.length}</Num> ערכים זמינים מתוך <Num>{MITZVOT_TOTAL}</Num>
        </span>
        <span className="text-[13px] leading-5 text-ink">
          מבחר ראשוני של מצוות הנוגעות לחיי היום-יום, ולא מאגר מלא. ההסברים קצרים ו{pending === mitzvot.length ? 'כולם' : `${pending} מהם`} ממתינים לבדיקה. בכל שאלה למעשה – לשאול רב.
        </span>
      </div>

      <Surface as="section" aria-label="המצווה של היום" className="p-4 flex flex-col gap-3 shadow-none">
        <SectionTitle title="המצווה של היום" />
        <MitzvahDetails m={today} />
        <LearnDo m={today} learnedToday={learnedToday.has(today.id)} onLearn={() => learn(today)} onDo={(k) => record(k)} />
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
                  <LearnDo m={m} learnedToday={learnedToday.has(m.id)} onLearn={() => learn(m)} onDo={(k) => record(k)} compact />
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
function LearnDo({ m, learnedToday, onLearn, onDo, compact }: { m: MitzvahEntry; learnedToday: boolean; onLearn: () => void; onDo: (key: NonNullable<(typeof DOING)[string]>) => void; compact?: boolean }) {
  const doing = DOING[m.id];
  return (
    <div className="flex flex-row flex-wrap gap-2">
      <Button variant={compact ? 'secondary' : 'primary'} size={compact ? 'sm' : 'md'} icon={learnedToday ? 'check' : 'book'} disabled={learnedToday} onClick={onLearn} aria-label={`למדתי על המצווה: ${m.title}`}>
        {learnedToday ? 'הלימוד נרשם היום' : 'למדתי על המצווה'}
      </Button>
      {doing ? (
        <Button variant="ghost" size={compact ? 'sm' : 'md'} icon="plus" onClick={() => onDo(doing)} aria-label={`רישום עשייה: ${actionDef(doing).title}`}>
          רישום עשייה: {actionDef(doing).title}
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
        {m.count ? ` · ${m.count.number} במניין הרמב״ם` : ''}
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
