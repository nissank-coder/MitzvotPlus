import React, { useState } from 'react';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { ActionRow, ExternalLink, FeatureScreen, Notice } from '../components/ui';
import { ActionKey, actionDef, categoryStyle } from '../data/actions';
import { nusachLabel, siddurUrl } from '../data/siddur';
import { formatClock, zmanimList } from '../lib/jewishCalendar';
import { countToday } from '../lib/scoring';
import { useAppStore } from '../store/AppStore';

type Props = { onBack: () => void; onOpenProfile: () => void };

export function PrayersScreen({ onBack, onOpenProfile }: Props) {
  const { state, derived, calendar, addAction } = useAppStore();
  const { zmanim, city, now, day } = calendar;
  const [minyan, setMinyan] = useState(false);
  const male = state.profile.gender === 'male';

  const prayers: Array<{ key: ActionKey; window?: string }> = [
    { key: 'birkotHashachar' },
    ...(male ? [{ key: 'tefillin' as const }] : []),
    ...(male ? [{ key: 'shema' as const, window: `עד ${formatClock(zmanim.sofZmanShma, city)}` }] : []),
    { key: 'shacharit', window: `עד ${formatClock(zmanim.sofZmanTfilla, city)} (בונוס בזמן)` },
    ...(day.isRoshChodesh || day.chanukahCandles ? [{ key: 'hallel' as const }] : []),
    ...(day.isRoshChodesh || day.isCholHamoed ? [{ key: 'musaf' as const }] : []),
    { key: 'mincha', window: `מ-${formatClock(zmanim.minchaGedola, city)} עד ${formatClock(zmanim.sunset, city)}` },
    { key: 'arvit', window: `מ-${formatClock(zmanim.tzeit, city)}` },
    { key: 'tehillim' },
  ];

  const zmanList = zmanimList(zmanim);
  if (day.isErevRest && zmanim.candleLighting) zmanList.push({ key: 'candle', label: 'הדלקת נרות', time: zmanim.candleLighting });
  zmanList.sort((a, b) => a.time.getTime() - b.time.getTime());

  return (
    <FeatureScreen title="תפילות וזמנים" subtitle={`נוסח ${nusachLabel[state.profile.nusach]} · ${city.name}`} icon="prayer" onBack={onBack} onOpenProfile={onOpenProfile}>
      <Card className="p-4 mb-4">
        <SectionHeader title="התפילות של היום" icon="prayer" />
        <label dir="rtl" className="flex flex-row items-center gap-2 mb-2 text-[13px] font-extrabold text-[#17324D] cursor-pointer">
          <input type="checkbox" checked={minyan} onChange={(e) => setMinyan(e.target.checked)} className="accent-[#2AAE9B] w-5 h-5" />
          התפללתי במניין (בונוס)
        </label>
        {prayers.map((p, i) => {
          const def = actionDef(p.key);
          const style = categoryStyle[def.category];
          const done = def.oncePerDay ? countToday(derived.todayLogs, derived.todayKey, p.key) > 0 : false;
          const bonus = minyan && def.minyanBonus ? def.minyanBonus : 0;
          return (
            <ActionRow
              key={p.key}
              icon={def.icon}
              title={def.title}
              subtitle={p.window}
              points={def.points + bonus}
              done={done}
              onPress={() => addAction(p.key, { minyan: Boolean(bonus) })}
              color={style.color}
              background={style.background}
              last={i === prayers.length - 1}
            />
          );
        })}
        <div className="mt-3 flex flex-row-reverse">
          <ExternalLink href={siddurUrl[state.profile.nusach]}>לסידור המלא – נוסח {nusachLabel[state.profile.nusach]} (ספריא)</ExternalLink>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="זמני היום" icon="clock" actionLabel={city.name} />
        {zmanList.map((z, i) => {
          const past = z.time < now;
          return (
            <div
              key={z.key}
              dir="rtl"
              className={`min-h-[44px] flex flex-row items-center justify-between ${i < zmanList.length - 1 ? 'border-b border-[#EAF0F4]' : ''}`}
            >
              <span className={`text-[14px] font-extrabold ${past ? 'text-[#A7B4C0]' : 'text-[#17324D]'}`}>{z.label}</span>
              <span className={`text-[15px] font-black tabular-nums ${past ? 'text-[#A7B4C0]' : 'text-[#1B6F8F]'}`}>{formatClock(z.time, city)}</span>
            </div>
          );
        })}
        <Notice>הזמנים מחושבים לפי מיקום העיר שנבחרה ושיטת הגר״א. צאת הכוכבים לפי 8.5°. יש לבדוק מול לוח מקומי ולנהוג לפי הוראת הרב.</Notice>
      </Card>
    </FeatureScreen>
  );
}
