import React, { useMemo, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { Chip, FeatureScreen, Notice } from '../components/ui';
import { afterLabel, BLESSING_DISCLAIMER, blessingGroups, BlessingText, blessingTexts, firstLabel, foods } from '../data/blessingGuide';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

type Props = { onBack: () => void; onOpenProfile: () => void; onOpenSiddur: (id?: string) => void };

export function BlessingGuideScreen({ onBack, onOpenProfile, onOpenSiddur }: Props) {
  const { state, addBlessing } = useAppStore();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<BlessingText['group']>('first');
  const [flash, setFlash] = useState<string | null>(null);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return foods.filter((f) => f.name.includes(q)).slice(0, 8);
  }, [query]);

  const bless = (b: BlessingText) => {
    addBlessing(b.category, b.title);
    setFlash(b.id);
    window.setTimeout(() => setFlash((v) => (v === b.id ? null : v)), 1200);
  };

  return (
    <FeatureScreen title="מה מברכים?" subtitle="ברכות הנהנין, הריח, הראייה והמצוות" icon="cup" onBack={onBack} onOpenProfile={onOpenProfile}>
      <Card className="p-4 mb-4">
        <label htmlFor="food-search" dir="rtl" className="block text-ink text-[15px] font-black mb-2">
          חיפוש מאכל או משקה
        </label>
        <input
          id="food-search"
          dir="rtl"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="לדוגמה: תמרים, אורז, קפה"
          className="w-full min-h-[46px] rounded-[16px] border border-line px-4 text-[15px] text-ink outline-none focus:border-brand"
        />
        {query.trim() && results.length === 0 ? (
          <p dir="rtl" className="text-ink-muted text-[13px] mt-3">לא נמצא במאגר. מומלץ לשאול רב.</p>
        ) : null}
        {results.map((f) => (
          <div key={f.name} dir="rtl" className="mt-3 rounded-[16px] bg-canvas p-3">
            <p className="text-ink text-[16px] font-black">{f.name}</p>
            <div className="flex flex-row flex-wrap gap-2 mt-2">
              <span className="px-2.5 py-1 rounded-full bg-brand-soft text-brand text-[12px] font-black">לפני: {firstLabel[f.first]}</span>
              <span className="px-2.5 py-1 rounded-full bg-brand-soft text-brand text-[12px] font-black">אחרי: {afterLabel[f.after]}</span>
            </div>
            {f.note ? <p className="text-ink-muted text-[11px] mt-2">{f.note}</p> : null}
          </div>
        ))}
      </Card>

      <div dir="rtl" className="flex flex-row gap-2 overflow-x-auto no-scrollbar pb-3">
        {(Object.keys(blessingGroups) as Array<BlessingText['group']>).map((g) => (
          <Chip key={g} active={group === g} onPress={() => setGroup(g)}>
            {blessingGroups[g]}
          </Chip>
        ))}
      </div>

      <Card className="p-4">
        <SectionHeader title={blessingGroups[group]} icon="star" />
        {blessingTexts
          .filter((b) => b.group === group)
          .map((b, i, arr) => (
            <div key={b.id} dir="rtl" className={`py-3 ${i < arr.length - 1 ? 'border-b border-line' : ''}`}>
              <div className="flex flex-row items-center justify-between gap-3">
                <span className="text-ink text-[15px] font-black">{b.title}</span>
                <button
                  type="button"
                  onClick={() => bless(b)}
                  className={`min-h-[44px] px-3 rounded-full text-[12px] font-extrabold transition-colors ${
                    flash === b.id ? 'bg-lime-soft text-lime-ink' : 'bg-brand text-white hover:bg-brand-press'
                  }`}
                >
                  {flash === b.id ? 'נרשם ✓' : 'בירכתי'}
                </button>
              </div>
              {b.inSiddur ? (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => onOpenSiddur(b.id === 'birkatHamazon' ? 'birkat-hamazon' : 'meein-shalosh')}
                    className="text-brand text-[13px] font-extrabold hover:underline"
                  >
                    לנוסח המלא בסידור ←
                  </button>
                </div>
              ) : (
                <p className="text-ink text-[17px] leading-8 mt-1">{b.text}</p>
              )}
              {b.note ? (
                <p className="text-ink-muted text-[11px] mt-1 flex flex-row items-center gap-1">
                  <AppIcon name="lightbulb" size={12} color={colors.gold} />
                  {b.note}
                </p>
              ) : null}
            </div>
          ))}
      </Card>
      <Notice>{BLESSING_DISCLAIMER}</Notice>
    </FeatureScreen>
  );
}
