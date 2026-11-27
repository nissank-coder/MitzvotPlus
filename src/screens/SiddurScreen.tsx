import React, { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { FontSizeControl, ReviewNotice, TextReader } from '../components/TextReader';
import { ExternalLink, FeatureScreen, Notice } from '../components/ui';
import { ActionKey, actionDef } from '../data/actions';
import { nusachLabel } from '../data/siddur';
import { NUSACH_AVAILABILITY, nusachAvailabilityText, outsideSiddurUrl, siddurPackFor } from '../content/nusach';
import {
  attributionFor, loadSiddurGroup, loadSiddurIndex, SIDDUR_GROUP_TITLES, SiddurGroup, SiddurIndex, SiddurPrayer,
} from '../content/packs';
import { countToday } from '../lib/scoring';
import { useAppStore } from '../store/AppStore';
import { useRecordFlow } from '../components/RecordFlow';
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
  const { state, derived, calendar } = useAppStore();
  // One recording flow (round 13, U5): a prayer is recorded with the minyan choice.
  const { record } = useRecordFlow();
  const [index, setIndex] = useState<SiddurIndex | null>(null);
  const [prayer, setPrayer] = useState<SiddurPrayer | null>(null);
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);
  const [failed, setFailed] = useState(false);

  // Round 14: the pack of the preferred nusach when this build has it, otherwise Sefard – said plainly.
  const pref = state.profile.nusach;
  const pack = siddurPackFor(pref);
  useEffect(() => {
    loadSiddurIndex(pack).then(setIndex, () => setFailed(true));
  }, [pack]);

  // Load the texts of the opened prayer's group.
  useEffect(() => {
    setPrayer(null);
    if (!openId || !index) return;
    const group = index.prayers.find((p) => p.id === openId)?.group;
    if (!group) return;
    let cancelled = false;
    loadSiddurGroup(group, pack).then(
      (pack) => !cancelled && setPrayer(pack.prayers.find((p) => p.id === openId) ?? null),
      () => !cancelled && setFailed(true),
    );
    window.scrollTo({ top: 0, behavior: 'instant' });
    return () => {
      cancelled = true;
    };
  }, [openId, index, pack]);

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
      subtitle={`נוסח ${nusachLabel[pack]} · עובד גם בלי אינטרנט`}
      icon="prayer"
      onBack={openId && !initialId ? () => setOpenId(null) : onBack}
      onOpenProfile={onOpenProfile}
    >
      {pref !== pack || NUSACH_AVAILABILITY[pref] === 'internal-review' ? (
        <div dir="rtl" className="rounded-[14px] bg-brand-soft px-3 py-2.5 mb-3 flex flex-col gap-1.5" role="note" data-testid="siddur-nusach">
          <p className="text-[13px] text-ink">
            <span className="font-bold">הנוסח שבחרת: {nusachLabel[pref]}.</span> {nusachAvailabilityText(pref)}
          </p>
          {pref !== pack ? <ExternalLink href={outsideSiddurUrl(pref)}>סידור {nusachLabel[pref]} בספריא (אתר חיצוני)</ExternalLink> : null}
        </div>
      ) : null}
      {failed ? <p dir="rtl" className="text-ink-muted">לא ניתן לטעון את הסידור.</p> : null}
      {(!index || (openId && !prayer)) && !failed ? <p dir="rtl" className="text-ink-muted p-4">טוען…</p> : null}

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
                    className={`w-full min-h-[54px] flex flex-row items-center gap-3 text-right ${i < items.length - 1 ? 'border-b border-line' : ''}`}
                  >
                    <span className="flex-1 text-ink text-[15px] font-black">{p.title}</span>
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
                onClick={() => record(action)}
                disabled={actionDone}
                className={`min-h-[44px] px-4 rounded-full text-[13px] font-extrabold ${actionDone ? 'bg-lime-soft text-lime-ink' : 'bg-brand text-white'}`}
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
              <section key={section.ref} className={i > 0 ? 'mt-6 pt-5 border-t border-line' : ''} aria-label={section.heTitle}>
                {prayer.sections.length > 1 ? (
                  <h2 dir="rtl" className="text-brand text-[15px] font-black mb-3">
                    {section.heTitle}
                  </h2>
                ) : null}
                <TextReader segments={section.segments} />
                <p dir="ltr" className="text-[10px] text-ink-muted mt-3 text-left">
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
