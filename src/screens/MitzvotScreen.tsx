import React, { useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { Chip, FeatureScreen, Notice } from '../components/ui';
import { actionDef } from '../data/actions';
import { MitzvahEntry, mitzvahOfDay, mitzvot, MITZVOT_TOTAL } from '../data/mitzvot';
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

export function MitzvotScreen({ onBack, onOpenProfile }: Props) {
  const { state, derived, addAction } = useAppStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const today = mitzvahOfDay(derived.todayKey);

  const learned = useMemo(
    () => new Set(state.logs.filter((l) => l.actionKey === 'mitzvahStudy').map((l) => l.refId)),
    [state.logs],
  );
  const learnedToday = new Set(derived.todayLogs.filter((l) => l.actionKey === 'mitzvahStudy').map((l) => l.refId));

  const list = mitzvot.filter((m) => {
    if (filter === 'aseh') return m.type === 'aseh';
    if (filter === 'lav') return m.type === 'lav';
    if (filter === 'constant') return m.constant;
    if (filter === 'unlearned') return !learned.has(m.id);
    return true;
  });

  const learn = (m: MitzvahEntry) => addAction('mitzvahStudy', { refId: m.id, title: `למדתי: ${m.title}` });

  return (
    <FeatureScreen title="תרי״ג מצוות" subtitle={`למדת ${learned.size} מתוך ${mitzvot.length} במאגר`} icon="scroll" onBack={onBack} onOpenProfile={onOpenProfile}>
      <Card className="p-4 mb-4">
        <SectionHeader title="המצווה של היום" icon="star" />
        <MitzvahDetails m={today} />
        <button
          type="button"
          disabled={learnedToday.has(today.id)}
          onClick={() => learn(today)}
          className="w-full min-h-[46px] mt-3 rounded-full bg-[#2AAE9B] text-white text-[14px] font-black disabled:bg-[#EAF7EF] disabled:text-[#4DAA78]"
        >
          {learnedToday.has(today.id) ? 'נלמד היום ✓' : `למדתי את המצווה (+${actionDef('mitzvahStudy').points})`}
        </button>
      </Card>

      <div dir="rtl" className="flex flex-row gap-2 overflow-x-auto no-scrollbar pb-3">
        {filters.map((f) => (
          <Chip key={f.key} active={filter === f.key} onPress={() => setFilter(f.key)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <Card className="px-4 py-1">
        {list.map((m, i) => {
          const isOpen = open === m.id;
          return (
            <div key={m.id} dir="rtl" className={`py-3 ${i < list.length - 1 ? 'border-b border-[#EAF0F4]' : ''}`}>
              <button type="button" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen} className="w-full flex flex-row items-center gap-3 text-right">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${learned.has(m.id) ? 'bg-[#4DAA78]' : 'bg-[#DDE8EE]'}`} />
                <span className="flex-1 text-[#17324D] text-[15px] font-black">{m.title}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${m.type === 'aseh' ? 'bg-[#E8F8F4] text-[#1E7D6F]' : 'bg-[#FDEDEA] text-[#B4544A]'}`}>
                  {m.type === 'aseh' ? 'עשה' : 'לא תעשה'}
                </span>
              </button>
              {isOpen ? (
                <div className="mt-2 mr-5">
                  <MitzvahDetails m={m} />
                  {!learnedToday.has(m.id) ? (
                    <button type="button" onClick={() => learn(m)} className="mt-2 h-8 px-3 rounded-full bg-[#EAF4FB] text-[#1B6F8F] text-[12px] font-black">
                      למדתי
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </Card>
      <Notice>
        מבחר ראשוני של {mitzvot.length} מצוות מתוך {MITZVOT_TOTAL}, הנוגעות לחיי היום-יום. המאגר המלא יתווסף לאחר בדיקה רבנית.
      </Notice>
    </FeatureScreen>
  );
}

function MitzvahDetails({ m }: { m: MitzvahEntry }) {
  return (
    <div dir="rtl">
      <p className="text-[#17324D] text-[17px] font-black">{m.title}</p>
      <p className="text-[#7D78C9] text-[12px] font-extrabold mt-0.5">
        {m.type === 'aseh' ? 'מצוות עשה' : 'מצוות לא תעשה'} · {m.source}
        {m.applies === 'men' ? ' · חלה על גברים' : ''}
      </p>
      <p className="text-[#17324D] text-[14px] leading-6 mt-2">{m.summary}</p>
      <p className="text-[#1B6F8F] text-[13px] leading-6 mt-1">
        <span className="font-black">בפועל: </span>
        {m.practice}
      </p>
    </div>
  );
}
