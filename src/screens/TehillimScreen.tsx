import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { FontSizeControl, ReviewNotice, TextReader } from '../components/TextReader';
import { FeatureScreen } from '../components/ui';
import { actionDef } from '../data/actions';
import { loadTehillim, rangeLabel, TehillimPack, TehillimRange, tehillimForDay } from '../content/packs';
import { hebrewNumeral } from '../lib/dates';
import { useAppStore } from '../store/AppStore';

type Props = { onBack: () => void; onOpenProfile: () => void };
type View = { kind: 'list' } | { kind: 'read'; ranges: TehillimRange[]; label: string };

const num = (n: number) => hebrewNumeral(n);

export function TehillimScreen({ onBack, onOpenProfile }: Props) {
  const { calendar, addAction } = useAppStore();
  const [pack, setPack] = useState<TehillimPack | null>(null);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    loadTehillim().then(setPack, () => setFailed(true));
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);

  const today = tehillimForDay(calendar.day.hebrewDay, calendar.day.hebrewMonthLength);
  const todayLabel = rangeLabel(today, num);

  const chapters = useMemo(() => {
    if (!pack || view.kind !== 'read') return [];
    const out: Array<{ chapter: number; firstVerse: number; verses: string[] }> = [];
    for (const r of view.ranges) {
      for (let c = r.from; c <= r.to; c += 1) {
        const ch = pack.chapters[c - 1];
        if (!ch) continue;
        const [a, b] = r.verses ?? [1, ch.verses.length];
        out.push({ chapter: c, firstVerse: a, verses: ch.verses.slice(a - 1, b) });
      }
    }
    return out;
  }, [pack, view]);

  const markSaid = (label: string) => {
    addAction('tehillim', { title: `תהילים ${label}` });
    setSaid(label);
  };

  return (
    <FeatureScreen
      title={view.kind === 'read' ? `תהילים ${view.label}` : 'תהילים'}
      subtitle="כל הספר, עובד גם בלי אינטרנט"
      icon="book"
      onBack={view.kind === 'read' ? () => setView({ kind: 'list' }) : onBack}
      onOpenProfile={onOpenProfile}
    >
      {failed ? <p dir="rtl" className="text-[#718397]">לא ניתן לטעון את ספר תהילים.</p> : null}
      {!pack && !failed ? <p dir="rtl" className="text-[#718397] p-4">טוען…</p> : null}

      {pack && view.kind === 'list' ? (
        <>
          <Card className="p-4 mb-4">
            <SectionHeader title="תהילים היום" icon="calendar" actionLabel={calendar.day.hebrewDate} />
            <p dir="rtl" className="text-[#17324D] text-[16px] font-black">פרקים {todayLabel}</p>
            <p dir="rtl" className="text-[#718397] text-[12px] mt-1">לפי חלוקת הספר לימי החודש העברי</p>
            <button
              type="button"
              onClick={() => setView({ kind: 'read', ranges: today, label: todayLabel })}
              className="w-full min-h-[48px] mt-3 rounded-full bg-[#2AAE9B] text-white text-[15px] font-black"
            >
              לקריאת תהילים היום
            </button>
          </Card>

          <Card className="p-4">
            <SectionHeader title="כל הפרקים" icon="book" />
            <div dir="rtl" className="grid grid-cols-6 gap-2">
              {pack.chapters.map((c) => (
                <button
                  key={c.chapter}
                  type="button"
                  aria-label={`פרק ${num(c.chapter)}`}
                  onClick={() => setView({ kind: 'read', ranges: [{ from: c.chapter, to: c.chapter }], label: num(c.chapter) })}
                  className="h-11 rounded-[12px] bg-[#F4F8FB] border border-[#DDE8EE] text-[#17324D] text-[14px] font-black hover:bg-[#EAF4FB]"
                >
                  {num(c.chapter)}
                </button>
              ))}
            </div>
          </Card>
        </>
      ) : null}

      {pack && view.kind === 'read' ? (
        <>
          <div className="flex flex-row-reverse items-center justify-between mb-3">
            <FontSizeControl />
            <button
              type="button"
              onClick={() => markSaid(view.label)}
              disabled={said === view.label}
              className={`h-10 px-4 rounded-full text-[13px] font-black ${said === view.label ? 'bg-[#EAF7EF] text-[#4DAA78]' : 'bg-[#2AAE9B] text-white'}`}
            >
              {said === view.label ? 'נרשם ✓' : `אמרתי (+${actionDef('tehillim').points})`}
            </button>
          </div>
          <ReviewNotice />
          <Card className="p-4">
            {chapters.map((ch, i) => (
              <section key={`${ch.chapter}-${ch.firstVerse}`} className={i > 0 ? 'mt-6 pt-5 border-t border-[#EAF0F4]' : ''}>
                <h2 dir="rtl" className="text-[#1B6F8F] text-[15px] font-black mb-2">
                  פרק {num(ch.chapter)}
                </h2>
                <TextReader segments={ch.verses.map((v, k) => ({ text: `${num(ch.firstVerse + k)} ${v}` }))} />
              </section>
            ))}
            <p dir="ltr" className="text-[10px] text-[#A7B4C0] mt-4 text-left">
              {pack.source.versionTitle} · {pack.source.license} · דרך ספריא
            </p>
          </Card>
        </>
      ) : null}
    </FeatureScreen>
  );
}
