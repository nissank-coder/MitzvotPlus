import React, { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { FontSizeControl, ReviewNotice, TextReader } from '../components/TextReader';
import { FeatureScreen, Notice } from '../components/ui';
import { ActionKey, actionDef } from '../data/actions';
import { nusachLabel } from '../data/siddur';
import {
  attributionFor, loadSiddurGroup, loadSiddurIndex, SIDDUR_GROUP_TITLES, SiddurGroup, SiddurIndex, SiddurPrayer,
} from '../content/packs';
import { countToday } from '../lib/scoring';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

type Props = { onBack: () => void; onOpenProfile: () => void; initialId?: string };

/** Prayer → the action recorded from the reader. */
const ACTION_FOR: Record<string, ActionKey> = {
  shacharit: 'shacharit',
  mincha: 'mincha',
  maariv: 'arvit',
  'birkat-hamazon': 'birkatHamazon',
  'shabbat-candles': 'candleLighting',
  'erev-shabbat-mincha': 'mincha',
  'shabbat-maariv': 'arvit',
  'shabbat-shacharit': 'shacharit',
  'shabbat-musaf': 'musaf',
  'shabbat-mincha': 'mincha',
  'shabbat-night-meal': 'kiddush',
  'shabbat-day-meal': 'kiddush',
  havdalah: 'havdalah',
  chanukah: 'chanukahCandles',
  purim: 'megillah',
  'sukkah-lulav': 'lulav',
  chametz: 'bedikatChametz',
  haggadah: 'seder',
};

export function SiddurScreen({ onBack, onOpenProfile, initialId }: Props) {
  const { state, derived, calendar, addAction } = useAppStore();
  const [index, setIndex] = useState<SiddurIndex | null>(null);
  const [prayer, setPrayer] = useState<SiddurPrayer | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    loadSiddurIndex().then(setIndex, () => setFailed(true));
  }, []);

  // Load the texts of the opened prayer's group.
  useEffect(() => {
    setPrayer(null);
    if (!openId || !index) return;
    const group = index.prayers.find((p) => p.id === openId)?.group;
    if (!group) return;
    let cancelled = false;
    loadSiddurGroup(group).then(
      (pack) => !cancelled && setPrayer(pack.prayers.find((p) => p.id === openId) ?? null),
      () => !cancelled && setFailed(true),
    );
    window.scrollTo({ top: 0, behavior: 'instant' });
    return () => {
      cancelled = true;
    };
  }, [openId, index]);

  // On Friday and Shabbat, Shabbat prayers come first; on festivals and Rosh Chodesh, holiday prayers.
  const order = useMemo<SiddurGroup[]>(() => {
    const d = calendar.day;
    if (d.isShabbat || (d.isErevRest && d.weekday === 5)) return ['shabbat', 'weekday', 'holiday'];
    if (d.isYomTov || d.isErevRest || d.isRoshChodesh || d.isCholHamoed || d.chanukahCandles) return ['holiday', 'shabbat', 'weekday'];
    return ['weekday', 'shabbat', 'holiday'];
  }, [calendar.day]);

  const title = openId ? (index?.prayers.find((p) => p.id === openId)?.title ?? 'סידור') : 'סידור';
  const action = openId ? ACTION_FOR[openId] : undefined;
  const actionDone = action ? Boolean(actionDef(action).oncePerDay) && countToday(derived.todayLogs, derived.todayKey, action) > 0 : false;

  return (
    <FeatureScreen
      title={title}
      subtitle="נוסח ספרד · עובד גם בלי אינטרנט"
      icon="prayer"
      onBack={openId && !initialId ? () => setOpenId(null) : onBack}
      onOpenProfile={onOpenProfile}
    >
      {state.profile.nusach !== 'sefard' ? (
        <p dir="rtl" className="text-[12px] text-[#1B6F8F] bg-[#EAF4FB] rounded-[14px] px-3 py-2 mb-3">
          כרגע זמין נוסח ספרד בלבד. נוסח {nusachLabel[state.profile.nusach]} יתווסף בהמשך.
        </p>
      ) : null}
      {failed ? <p dir="rtl" className="text-[#718397]">לא ניתן לטעון את הסידור.</p> : null}
      {(!index || (openId && !prayer)) && !failed ? <p dir="rtl" className="text-[#718397] p-4">טוען…</p> : null}

      {index && !openId
        ? order.map((group) => {
            const items = index.prayers.filter((p) => p.group === group);
            return (
              <Card key={group} className="px-4 pt-4 pb-1 mb-4">
                <SectionHeader title={SIDDUR_GROUP_TITLES[group]} icon={group === 'shabbat' ? 'flame' : group === 'holiday' ? 'calendar' : 'prayer'} />
                {items.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    dir="rtl"
                    className={`w-full min-h-[54px] flex flex-row items-center gap-3 text-right ${i < items.length - 1 ? 'border-b border-[#EAF0F4]' : ''}`}
                  >
                    <span className="flex-1 text-[#17324D] text-[15px] font-black">{p.title}</span>
                    <AppIcon name="chevronLeft" size={18} color={colors.textMuted} />
                  </button>
                ))}
              </Card>
            );
          })
        : null}

      {prayer ? (
        <>
          <div className="flex flex-row-reverse items-center justify-between mb-3">
            <FontSizeControl />
            {action ? (
              <button
                type="button"
                onClick={() => addAction(action)}
                disabled={actionDone}
                className={`h-10 px-4 rounded-full text-[13px] font-black ${actionDone ? 'bg-[#EAF7EF] text-[#4DAA78]' : 'bg-[#2AAE9B] text-white'}`}
              >
                {actionDone ? `${actionDef(action).title} – נרשם ✓` : `סיימתי ${actionDef(action).title} (+${actionDef(action).points})`}
              </button>
            ) : (
              <span />
            )}
          </div>
          <ReviewNotice />
          <Card className="p-4">
            {prayer.sections.map((section, i) => (
              <section key={section.ref} className={i > 0 ? 'mt-6 pt-5 border-t border-[#EAF0F4]' : ''} aria-label={section.heTitle}>
                {prayer.sections.length > 1 ? (
                  <h2 dir="rtl" className="text-[#1B6F8F] text-[15px] font-black mb-3">
                    {section.heTitle}
                  </h2>
                ) : null}
                <TextReader segments={section.segments} />
                <p dir="ltr" className="text-[10px] text-[#A7B4C0] mt-3 text-left">
                  {attributionFor(section)}
                </p>
              </section>
            ))}
          </Card>
          <Notice>הסידור מציג את הנוסח המלא. קטעים שנאמרים רק בימים מסוימים מסומנים בכתב קטן לפי המקור.</Notice>
        </>
      ) : null}
    </FeatureScreen>
  );
}
