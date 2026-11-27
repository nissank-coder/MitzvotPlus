import React, { useMemo, useState } from 'react';
import { ActionKey, actionDef } from '../data/actions';
import { flags } from '@hebcal/core';
import { getDayInfo } from '../lib/jewishCalendar';
import { backfillChecklist } from '../lib/todayPlan';
import { dateFromKey } from '../lib/dates';
import { useAppStore } from '../store/AppStore';
import { ds } from '../theme';
import { AppIcon } from './AppIcon';
import { ModalLayer } from './Modal';

const FULL_SHABBAT: ActionKey[] = ['kiddush', 'shabbatMeal', 'havdalah'];

/** After Shabbat / Yom Tov: fill in what was done, recorded on the day itself. */
export function BackfillSheet({ days, onClose }: { days: string[]; onClose: () => void }) {
  const { state, calendar, backfill } = useAppStore();
  const il = calendar.city.il;
  const lastDay = days[days.length - 1];

  const sections = useMemo(
    () =>
      days.map((dateKey) => {
        const info = getDayInfo(dateKey, il);
        const items = backfillChecklist(info, state.profile.gender).filter(
          (i) => i.key !== 'havdalah' || dateKey === lastDay,
        );
        const title = info.isShabbat && !info.isYomTov ? 'שבת' : info.holidays.find((h) => h.flags & flags.CHAG)?.title ?? 'יום טוב';
        const date = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(dateFromKey(dateKey));
        return { dateKey, info, items, title: `${title} · ${info.hebrewDate} · ${date}` };
      }),
    [days, il, lastDay, state.profile.gender],
  );

  // counts[dateKey][key] = number of times
  const [counts, setCounts] = useState<Record<string, Record<string, number>>>({});
  const get = (d: string, k: string) => counts[d]?.[k] ?? 0;
  const set = (d: string, k: string, v: number) => setCounts((prev) => ({ ...prev, [d]: { ...prev[d], [k]: v } }));

  const save = () => {
    const inputs: Array<{ key: ActionKey; dateKey: string; title?: string }> = [];
    for (const section of sections) {
      for (const item of section.items) {
        const n = get(section.dateKey, item.key);
        for (let i = 0; i < n; i += 1) {
          inputs.push({ key: item.key, dateKey: section.dateKey, title: item.key === 'prayer' ? item.title : undefined });
        }
      }
      if (section.info.isShabbat && FULL_SHABBAT.every((k) => get(section.dateKey, k) > 0) && get(section.dateKey, 'shabbatMeal') >= 3) {
        inputs.push({ key: 'fullShabbat', dateKey: section.dateKey });
      }
    }
    backfill(inputs, days);
    onClose();
  };

  return (
    <ModalLayer
      label="רישום שבת"
      onClose={onClose}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-[#0E1630]/45"
      panelClassName="w-full max-w-[460px] max-h-[88dvh] overflow-y-auto bg-surface rounded-t-[28px] px-5 pt-2 sheet-safe"
    >
        <div aria-hidden="true" className="w-12 h-[5px] rounded-full bg-line mx-auto mb-4" />
        <h2 className="text-ink text-[22px] font-extrabold">מה עשית ב{sections.length > 1 ? 'ימים הקדושים' : sections[0]?.info.isShabbat ? 'שבת' : 'חג'}?</h2>
        <p className="text-ink-muted text-[14px] mt-1">המצוות יירשמו בתאריך שבו נעשו. שבת מלאה (קידוש, שלוש סעודות והבדלה) מזכה בבונוס.</p>

        {sections.map((section) => (
          <div key={section.dateKey} className="mt-5">
            <p className="text-brand text-[13px] font-bold mb-1">{section.title}</p>
            {section.items.map((item) => {
              const max = item.times ?? actionDef(item.key).dailyCap ?? 1;
              const n = get(section.dateKey, item.key);
              const multi = (item.times ?? 1) > 1;
              return (
                <div key={item.key + item.title} className="min-h-[56px] flex flex-row items-center justify-between gap-2 border-b border-line">
                  <span className="text-ink text-[15px] font-bold">{item.title}</span>
                  {multi ? (
                    <div className="flex flex-row items-center gap-2">
                      {Array.from({ length: max }, (_, i) => (
                        <button
                          key={i}
                          type="button"
                          aria-label={`${item.title} ${i + 1}`}
                          aria-pressed={n > i}
                          onClick={() => set(section.dateKey, item.key, n > i ? i : i + 1)}
                          className={`w-11 h-11 rounded-full border text-[14px] font-extrabold ${n > i ? 'bg-brand border-brand text-on-brand' : 'bg-surface border-line text-ink-muted'}`}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={n > 0}
                      aria-label={item.title}
                      onClick={() => set(section.dateKey, item.key, n > 0 ? 0 : 1)}
                      className={`w-11 h-11 rounded-[14px] border-2 flex items-center justify-center ${n > 0 ? 'bg-lime border-lime' : 'bg-surface border-[#B8C4DA]'}`}
                    >
                      {n > 0 ? <AppIcon name="check" size={20} color={ds.ink} strokeWidth={3} /> : null}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <button type="button" onClick={save} className="w-full min-h-[56px] mt-6 rounded-[18px] bg-brand text-on-brand text-[16px] font-bold active:bg-brand-press">
          שמירה
        </button>
        <button type="button" onClick={() => { backfill([], days); onClose(); }} className="w-full min-h-[48px] mt-2 rounded-[16px] text-ink-muted text-[14px] font-bold active:bg-canvas">
          לא עכשיו – לא להציג שוב
        </button>
    </ModalLayer>
  );
}
