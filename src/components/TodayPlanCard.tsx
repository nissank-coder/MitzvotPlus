import React from 'react';
import { actionDef, categoryStyle } from '../data/actions';
import { formatClock } from '../lib/jewishCalendar';
import { useAppStore } from '../store/AppStore';
import { useRecordFlow } from './RecordFlow';
import { ActionRow } from './ui';
import { Card } from './Card';
import { SectionHeader } from './SectionHeader';

/** Actions defined by their time ("קריאת שמע בזמנה"): not recordable after the deadline. */
const TIME_BOUND = new Set(['shema']);

/** "The mitzvot of today" – built from the Hebrew calendar and the user's profile. */
export function TodayPlanCard() {
  const { calendar, previewPoints } = useAppStore();
  // One recording flow (round 13, U5): a prayer asks "במניין או ביחידות" in the shared sheet.
  const { record } = useRecordFlow();
  const { plan, city, now } = calendar;
  if (plan.length === 0) return null;
  const doneCount = plan.filter((p) => p.done).length;

  return (
    <Card className="p-4 mb-4">
      <SectionHeader title="המצוות של היום" icon="scroll" actionLabel={`${doneCount}/${plan.length}`} />
      {plan.map((item, index) => {
        const def = actionDef(item.key);
        const style = categoryStyle[def.category];
        const parts: string[] = [];
        if (item.from && now < item.from) parts.push(`מ-${formatClock(item.from, city)}`);
        if (item.deadline) parts.push(`עד ${formatClock(item.deadline, city)}`);
        if (item.note && !item.deadline) parts.push(item.note);
        if (item.required > 1) parts.push(`${item.count}/${item.required}`);
        const late = Boolean(!item.done && item.deadline && now > item.deadline);
        // An action whose name claims "in its time" cannot be recorded after the time (A07).
        const closed = late && TIME_BOUND.has(item.key);
        return (
          <ActionRow
            key={item.key}
            icon={def.icon}
            title={item.title}
            subtitle={closed ? 'הזמן עבר – לא נרשם כ"בזמנה"' : late ? 'הזמן עבר · נרשם ללא בונוס זמן' : parts.join(' · ') || undefined}
            points={closed ? 0 : previewPoints(item.key, {})}
            done={item.done}
            onPress={closed ? undefined : () => record(item.key)}
            trailing={def.minyanBonus && !item.done ? <span className="text-[11px] font-bold text-[#718397] shrink-0">במניין או ביחידות</span> : null}
            color={style.color}
            background={style.background}
            last={index === plan.length - 1}
          />
        );
      })}
    </Card>
  );
}
