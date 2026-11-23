import React, { useEffect, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { FontSizeControl, ReviewNotice, TextReader } from '../components/TextReader';
import { FeatureScreen, Notice } from '../components/ui';
import { ActionKey, actionDef } from '../data/actions';
import { nusachLabel } from '../data/siddur';
import { attributionFor, loadSiddurSefard, SiddurPack } from '../content/packs';
import { countToday } from '../lib/scoring';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

type Props = { onBack: () => void; onOpenProfile: () => void; initialId?: string };

/** Prayer → the action recorded with "התפללתי" / "בירכתי". */
const ACTION_FOR: Record<string, ActionKey> = {
  shacharit: 'shacharit',
  mincha: 'mincha',
  maariv: 'arvit',
  'birkat-hamazon': 'birkatHamazon',
};

export function SiddurScreen({ onBack, onOpenProfile, initialId }: Props) {
  const { state, derived, addAction } = useAppStore();
  const [pack, setPack] = useState<SiddurPack | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(initialId ?? null);

  useEffect(() => {
    loadSiddurSefard().then(setPack, () => setFailed(true));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [openId]);

  const prayer = pack?.prayers.find((p) => p.id === openId) ?? null;
  const title = prayer ? prayer.title : 'סידור';

  return (
    <FeatureScreen
      title={title}
      subtitle={`נוסח ספרד · עובד גם בלי אינטרנט`}
      icon="prayer"
      onBack={prayer && !initialId ? () => setOpenId(null) : onBack}
      onOpenProfile={onOpenProfile}
    >
      {state.profile.nusach !== 'sefard' ? (
        <p dir="rtl" className="text-[12px] text-[#1B6F8F] bg-[#EAF4FB] rounded-[14px] px-3 py-2 mb-3">
          כרגע זמין נוסח ספרד בלבד. נוסח {nusachLabel[state.profile.nusach]} יתווסף בהמשך.
        </p>
      ) : null}

      {failed ? <p dir="rtl" className="text-[#718397]">לא ניתן לטעון את הסידור.</p> : null}
      {!pack && !failed ? <p dir="rtl" className="text-[#718397] p-4">טוען…</p> : null}

      {pack && !prayer ? (
        <Card className="px-4 py-1">
          {pack.prayers.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpenId(p.id)}
              dir="rtl"
              className={`w-full min-h-[60px] flex flex-row items-center gap-3 text-right ${i < pack.prayers.length - 1 ? 'border-b border-[#EAF0F4]' : ''}`}
            >
              <div className="w-10 h-10 rounded-[14px] bg-[#EAF4FB] flex items-center justify-center shrink-0">
                <AppIcon name="prayer" size={19} color={colors.primary} />
              </div>
              <span className="flex-1 text-[#17324D] text-[16px] font-black">{p.title}</span>
              <AppIcon name="chevronLeft" size={18} color={colors.textMuted} />
            </button>
          ))}
        </Card>
      ) : null}

      {prayer ? (
        <>
          <div className="flex flex-row-reverse items-center justify-between mb-3">
            <FontSizeControl />
            {ACTION_FOR[prayer.id] ? <PrayedButton actionKey={ACTION_FOR[prayer.id]!} done={countToday(derived.todayLogs, derived.todayKey, ACTION_FOR[prayer.id]!) > 0 && Boolean(actionDef(ACTION_FOR[prayer.id]!).oncePerDay)} onPress={() => addAction(ACTION_FOR[prayer.id]!)} /> : <span />}
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

function PrayedButton({ actionKey, done, onPress }: { actionKey: ActionKey; done: boolean; onPress: () => void }) {
  const def = actionDef(actionKey);
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={done}
      className={`h-10 px-4 rounded-full text-[13px] font-black ${done ? 'bg-[#EAF7EF] text-[#4DAA78]' : 'bg-[#2AAE9B] text-white'}`}
    >
      {done ? `${def.title} – נרשם ✓` : `סיימתי ${def.title} (+${def.points})`}
    </button>
  );
}
