import React from 'react';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { mitzvahOfDay } from '../data/mitzvot';
import { DVAR_TORAH_AVAILABLE } from '../content/registry';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { FeatureKey, IconName } from '../types';

type Tile = { key: Exclude<FeatureKey, null>; title: string; subtitle: string; icon: IconName; color: string; background: string };

export function ContentScreen({ onOpenFeature, onOpenProfile }: { onOpenFeature: (f: Exclude<FeatureKey, null>) => void; onOpenProfile: () => void }) {
  const { derived, calendar } = useAppStore();
  const nextHoliday = calendar.day.holidays[0]?.title;

  const tiles: Tile[] = [
    { key: 'siddur', title: 'סידור', subtitle: 'נוסח ספרד – שחרית, מנחה, ערבית, ברכת המזון', icon: 'prayer', color: colors.primary, background: colors.blueSoft },
    { key: 'tehillim', title: 'תהילים', subtitle: 'כל 150 הפרקים, ותהילים היום', icon: 'book', color: colors.teal, background: colors.mintSoft },
    { key: 'prayers', title: 'תפילות וזמנים', subtitle: 'סידור, זמני היום ומניין', icon: 'prayer', color: colors.primary, background: colors.blueSoft },
    { key: 'blessingGuide', title: 'מה מברכים?', subtitle: 'ברכות הנהנין, הריח והראייה', icon: 'cup', color: colors.gold, background: colors.goldSoft },
    { key: 'blessings', title: 'מונה 100 ברכות', subtitle: `${derived.blessingTotal} ברכות היום`, icon: 'star', color: colors.teal, background: colors.mintSoft },
    { key: 'learning', title: 'לימוד יומי', subtitle: 'הלכה, תהילים, דף יומי ועוד', icon: 'bookmark', color: colors.purple, background: colors.purpleSoft },
    { key: 'mitzvot', title: 'ספריית מצוות', subtitle: `היום: ${mitzvahOfDay(derived.todayKey).title}`, icon: 'scroll', color: colors.purple, background: colors.purpleSoft },
    { key: 'holidays', title: 'חגים ומועדים', subtitle: nextHoliday ?? 'הלכות ומצוות לכל מועד', icon: 'calendar', color: colors.green, background: colors.greenSoft },
    { key: 'torah', title: 'דבר תורה', subtitle: 'מחשבה קצרה ליום', icon: 'book', color: colors.purple, background: colors.purpleSoft },
    { key: 'speech', title: 'שמירת הלשון', subtitle: 'טיימר ושיא אישי', icon: 'chat', color: colors.coral, background: colors.coralSoft },
    { key: 'goals', title: 'התקדמות ויעדים', subtitle: `דרגה ${derived.level.level} – ${derived.level.name}`, icon: 'target', color: colors.primary, background: colors.blueSoft },
  ];

  return (
    <div className="flex-1 bg-canvas px-4 pb-8 pt-2">
      <AppHeader onProfilePress={onOpenProfile} />
      <div dir="rtl" className="mb-4">
        <h1 className="text-ink text-[24px] font-black leading-tight">סידור ותוכן</h1>
        <p className="text-ink-muted text-[13px] mt-1">כל מה שצריך כדי להוסיף עוד מצווה</p>
      </div>
      <div dir="rtl" className="grid grid-cols-2 gap-3">
        {tiles.filter((t) => t.key !== 'torah' || DVAR_TORAH_AVAILABLE).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onOpenFeature(t.key)}
            className="min-h-[132px] rounded-[22px] bg-white border border-line card-shadow p-4 flex flex-col items-start text-right hover:border-brand transition-colors"
          >
            <div className="w-11 h-11 rounded-[16px] flex items-center justify-center" style={{ backgroundColor: t.background }}>
              <AppIcon name={t.icon} size={22} color={t.color} />
            </div>
            <span className="text-ink text-[15px] font-black mt-3">{t.title}</span>
            <span className="text-ink-muted text-[11px] mt-1 leading-4">{t.subtitle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
