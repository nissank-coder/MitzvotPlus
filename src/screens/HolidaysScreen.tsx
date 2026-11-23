import React, { useMemo, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { ActionRow, FeatureScreen, Notice } from '../components/ui';
import { actionDef, categoryStyle } from '../data/actions';
import { guideForDesc, HolidayGuide } from '../data/holidays';
import { dateFromKey } from '../lib/dates';
import { upcomingHolidays } from '../lib/jewishCalendar';
import { countToday } from '../lib/scoring';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

type Props = { onBack: () => void; onOpenProfile: () => void };

function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((dateFromKey(toKey).getTime() - dateFromKey(fromKey).getTime()) / 86_400_000);
}

export function HolidaysScreen({ onBack, onOpenProfile }: Props) {
  const { derived, calendar } = useAppStore();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const list = useMemo(() => {
    const seen = new Set<string>();
    return upcomingHolidays(derived.todayKey, calendar.city.il, 365)
      .map((h) => ({ ...h, guide: guideForDesc(h.desc) }))
      .filter((h) => {
        if (!h.guide) return false;
        if (seen.has(h.guide.key)) return false;
        seen.add(h.guide.key);
        return true;
      });
  }, [derived.todayKey, calendar.city.il]);

  const todayGuides = calendar.day.holidays.map((h) => guideForDesc(h.desc)).filter((g): g is HolidayGuide => Boolean(g));
  const uniqueToday = [...new Map(todayGuides.map((g) => [g.key, g])).values()];

  return (
    <FeatureScreen title="חגים ומועדים" subtitle={`${calendar.day.hebrewDate} · ${calendar.city.il ? 'ארץ ישראל' : 'חוץ לארץ'}`} icon="calendar" onBack={onBack} onOpenProfile={onOpenProfile}>
      {uniqueToday.map((guide) => (
        <Card key={guide.key} className="p-4 mb-4 border-[#F4B942]">
          <SectionHeader title={`היום: ${guide.title}`} icon="star" />
          <GuideBody guide={guide} active />
        </Card>
      ))}

      <Card className="px-4 py-1">
        {list.map((h, i) => {
          const guide = h.guide!;
          const isOpen = openKey === guide.key;
          const days = daysBetween(derived.todayKey, h.dateKey);
          const when = days === 0 ? 'היום' : days === 1 ? 'מחר' : `בעוד ${days} ימים`;
          return (
            <div key={guide.key} dir="rtl" className={`py-3 ${i < list.length - 1 ? 'border-b border-[#EAF0F4]' : ''}`}>
              <button type="button" onClick={() => setOpenKey(isOpen ? null : guide.key)} aria-expanded={isOpen} className="w-full flex flex-row items-center gap-3 text-right">
                <div className="w-10 h-10 rounded-[14px] bg-[#EAF7EF] flex items-center justify-center shrink-0">
                  <AppIcon name="calendar" size={19} color={colors.green} />
                </div>
                <div className="flex-1 flex flex-col">
                  <span className="text-[#17324D] text-[15px] font-black">{guide.title}</span>
                  <span className="text-[#718397] text-[11px]">{h.hebrewDate}</span>
                </div>
                <span className="text-[#1B6F8F] text-[12px] font-black">{when}</span>
              </button>
              {isOpen ? (
                <div className="mt-3">
                  <GuideBody guide={guide} active={false} />
                </div>
              ) : null}
            </div>
          );
        })}
      </Card>
      <Notice>ההלכות בקצרה בלבד, כתזכורת. לפרטים ולמנהג המקום – לשאול רב.</Notice>
    </FeatureScreen>
  );
}

function GuideBody({ guide, active }: { guide: HolidayGuide; active: boolean }) {
  const { derived, calendar, addAction } = useAppStore();
  const canLog = active && !calendar.day.isRestDay;
  return (
    <div dir="rtl">
      <p className="text-[#17324D] text-[14px] leading-6">{guide.summary}</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {guide.laws.map((law) => (
          <li key={law} className="flex flex-row items-start gap-2 text-[#17324D] text-[13px] leading-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2AAE9B] mt-2 shrink-0" />
            {law}
          </li>
        ))}
      </ul>
      {canLog ? (
        <div className="mt-3">
          {guide.actions.map((key, i) => {
            const def = actionDef(key);
            const style = categoryStyle[def.category];
            const done = def.oncePerDay && countToday(derived.todayLogs, derived.todayKey, key) > 0;
            return (
              <ActionRow
                key={key}
                icon={def.icon}
                title={def.title}
                points={def.points}
                done={Boolean(done)}
                onPress={() => addAction(key)}
                color={style.color}
                background={style.background}
                last={i === guide.actions.length - 1}
              />
            );
          })}
        </div>
      ) : (
        <p className="text-[#718397] text-[11px] mt-3">
          מצוות היום: {guide.actions.map((k) => actionDef(k).title).join(' · ')}
        </p>
      )}
    </div>
  );
}
