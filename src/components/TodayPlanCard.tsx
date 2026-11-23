import React, { useState } from 'react';
import { actionDef, categoryStyle } from '../data/actions';
import { formatClock } from '../lib/jewishCalendar';
import { useAppStore } from '../store/AppStore';
import { ActionRow } from './ui';
import { Card } from './Card';
import { SectionHeader } from './SectionHeader';

/** "The mitzvot of today" – built from the Hebrew calendar and the user's profile. */
export function TodayPlanCard() {
  const { calendar, addAction } = useAppStore();
  const { plan, city, now } = calendar;
  const [minyan, setMinyan] = useState<Record<string, boolean>>({});
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
        const late = !item.done && item.deadline && now > item.deadline;
        return (
          <ActionRow
            key={item.key}
            icon={def.icon}
            title={item.title}
            subtitle={late ? 'הזמן עבר' : parts.join(' · ') || undefined}
            points={def.points + (def.minyanBonus && minyan[item.key] ? def.minyanBonus : 0)}
            done={item.done}
            onPress={() => addAction(item.key, { minyan: Boolean(def.minyanBonus && minyan[item.key]) })}
            trailing={
              def.minyanBonus && !item.done ? (
                <label className="flex flex-row items-center gap-1 text-[11px] font-bold text-[#718397] shrink-0 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(minyan[item.key])}
                    onChange={(e) => setMinyan((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                    className="accent-[#2AAE9B] w-4 h-4"
                  />
                  במניין
                </label>
              ) : null
            }
            color={style.color}
            background={style.background}
            last={index === plan.length - 1}
          />
        );
      })}
    </Card>
  );
}
