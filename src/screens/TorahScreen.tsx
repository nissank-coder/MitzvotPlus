import React, { useEffect, useMemo, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { CitySilhouette, HillDecoration } from '../components/Decorations';
import { FeatureHeader } from '../components/FeatureHeader';
import { ProgressRing } from '../components/ProgressRing';
import { TORAH_TEXT } from '../data';
import { useAppStore } from '../store/AppStore';
import { actionDef } from '../data/actions';
import { colors } from '../theme';

type Props = {
  onBack: () => void;
  onOpenProfile: () => void;
};

function todayHebrewLabel(): string {
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat('he-IL', { dateStyle: 'full' }).format(new Date());
  }
}

export function TorahScreen({ onBack, onOpenProfile }: Props) {
  const { state, derived, toggleTorahSaved, completeTorah, setReflection } = useAppStore();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const dateLabel = useMemo(todayHebrewLabel, []);
  const streakProgress = Math.min(1, derived.torahStreak / 30);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const toggleSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setShareFeedback('הקראה קולית אינה נתמכת בדפדפן זה');
      setTimeout(() => setShareFeedback(null), 2500);
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(TORAH_TEXT);
    utterance.lang = 'he-IL';
    utterance.rate = 0.88;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const shareText = async () => {
    const text = `מחשבה יומית ממצוות+\n\n${TORAH_TEXT}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'דבר תורה יומי - מצוות+', text });
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setShareFeedback('הטקסט הועתק ללוח לשיתוף');
        setTimeout(() => setShareFeedback(null), 2500);
      }
    } catch {
      // User dismissed share sheet
    }
  };

  return (
    <div className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-2">
      <AppHeader onProfilePress={onOpenProfile} />
      <FeatureHeader
        title="דבר תורה"
        subtitle="רגע קצר של לימוד ומשמעות"
        icon="book"
        onBack={onBack}
      />

      <div className="relative min-h-[126px] rounded-[28px] bg-[#E8F4F7] border border-[#D5E8EC] overflow-hidden flex flex-col justify-center mb-4 card-shadow">
        <CitySilhouette opacity={0.28} />
        <div className="relative z-10 flex flex-col items-end px-5">
          <h2 dir="rtl" className="text-[#17324D] text-[24px] font-black leading-tight">
            דבר תורה יומי
          </h2>
          <p dir="rtl" className="text-[#718397] text-[13px] mt-1">
            כמה דקות שמאירות את היום
          </p>
        </div>
      </div>

      <Card className="p-5 mb-4">
        <div className="flex flex-row-reverse items-center justify-center gap-2">
          <span dir="rtl" className="text-[#718397] text-[13px] font-bold">
            {dateLabel}
          </span>
          <AppIcon name="calendar" size={18} color={colors.primary} />
        </div>

        <div className="flex flex-row items-center gap-2 my-4">
          <div className="flex-1 h-px bg-[#DDE8EE]" />
          <AppIcon name="leaf" size={20} color={colors.teal} />
          <div className="flex-1 h-px bg-[#DDE8EE]" />
        </div>

        <h3 dir="rtl" className="text-[#17324D] text-[25px] font-black text-center">
          מחשבה יומית
        </h3>
        <p dir="rtl" className="text-[#17324D] text-[16px] leading-[28px] text-right mt-4">
          {TORAH_TEXT}
        </p>

        <div className="flex justify-center mt-4">
          <div className="px-3 py-2 rounded-full bg-[#F4F8FB]">
            {/* Placeholder until an approved, licensed edition is bundled (D08). No source is claimed. */}
            <span dir="rtl" className="text-[#718397] text-[13px] font-bold">
              טקסט זמני – ממתין לתוכן מאושר
            </span>
          </div>
        </div>

        <div className="flex flex-row gap-2 mt-5">
          <ActionButton
            label={isSpeaking ? 'עצור' : 'האזן'}
            icon={isSpeaking ? 'pause' : 'play'}
            active={isSpeaking}
            onPress={toggleSpeech}
          />
          <ActionButton label="שתף" icon="share" onPress={shareText} />
          <ActionButton
            label={state.torahSaved ? 'נשמר' : 'שמור'}
            icon="bookmark"
            active={state.torahSaved}
            onPress={toggleTorahSaved}
          />
        </div>

        {shareFeedback ? (
          <p dir="rtl" className="mt-2.5 text-center text-[12px] font-bold text-[#2AAE9B]">
            {shareFeedback}
          </p>
        ) : null}

        <button
          type="button"
          onClick={completeTorah}
          disabled={derived.torahCompletedToday}
          className={`w-full min-h-[50px] rounded-[16px] mt-3 flex flex-row-reverse items-center justify-center gap-2 px-3 transition-colors ${
            derived.torahCompletedToday
              ? 'bg-[#EAF7EF] border border-[#CFE8D8] cursor-default'
              : 'bg-[#2AAE9B] hover:bg-[#239988]'
          }`}
        >
          <AppIcon
            name={derived.torahCompletedToday ? 'check' : 'book'}
            size={20}
            color={derived.torahCompletedToday ? colors.green : colors.white}
          />
          <span
            dir="rtl"
            className={`text-[13px] font-black ${
              derived.torahCompletedToday ? 'text-[#4DAA78]' : 'text-white'
            }`}
          >
            {derived.torahCompletedToday ? 'הלימוד נרשם להיום' : `סיימתי ללמוד - הוסף ${actionDef('dailyTorah').points} נקודות`}
          </span>
        </button>
      </Card>

      <Card className="min-h-[146px] p-4 flex flex-row items-center gap-3 overflow-hidden mb-4">
        <HillDecoration />
        <div className="flex-1 flex flex-col items-end">
          <div className="flex flex-row-reverse items-center gap-2 mb-3">
            <span dir="rtl" className="text-[#17324D] text-[17px] font-black">
              איך זה פוגש אותי היום?
            </span>
            <AppIcon name="edit" size={20} color={colors.primary} />
          </div>
          <p dir="rtl" className="text-[#718397] text-[13px] leading-[21px] text-right mt-1">
            איזו מצווה קטנה אוכל להוסיף היום?
          </p>
          <p dir="rtl" className="text-[#718397] text-[13px] leading-[21px] text-right mt-1">
            איך היא יכולה להוסיף אור ומשמעות ליום שלי?
          </p>
        </div>
      </Card>

      <Card className="p-4 mb-4">
        <div className="flex flex-row-reverse items-center gap-2 mb-3">
          <span dir="rtl" className="text-[#17324D] text-[17px] font-black">
            המחשבה שלי
          </span>
          <AppIcon name="edit" size={19} color={colors.teal} />
        </div>
        <textarea
          value={derived.reflection}
          onChange={(e) => setReflection(e.target.value)}
          dir="rtl"
          rows={4}
          placeholder="אפשר לכתוב כאן תזכורת קצרה לעצמך..."
          className="w-full min-h-[100px] rounded-[16px] bg-[#F4F8FB] border border-[#DDE8EE] p-3 text-[#17324D] text-[15px] leading-[22px] text-right placeholder:text-[#718397] focus:outline-none focus:border-[#2AAE9B] resize-y"
        />
      </Card>

      <Card className="min-h-[132px] p-4 flex flex-row items-center gap-3 mb-4">
        <div className="relative w-[92px] h-[82px] flex justify-end items-center shrink-0">
          <div className="absolute w-[68px] h-[58px] rounded-[6px] bg-[#244A64] -rotate-7 bottom-[5px] left-[12px]" />
          <div className="absolute w-[72px] h-[54px] rounded-[6px] bg-[#3F6E86] rotate-6 bottom-[6px] left-[10px]" />
          <div className="relative z-10 w-[66px] h-[52px] rounded-[6px] bg-[#17324D] border-2 border-[#F4B942] mx-auto mt-auto" />
        </div>
        <div className="flex-1 flex flex-col items-end">
          <div className="flex flex-row-reverse items-center gap-2">
            <span dir="rtl" className="text-[#17324D] text-[17px] font-black">
              רצף לימוד
            </span>
            <AppIcon name="flame" size={21} color={colors.coral} />
          </div>
          <span dir="rtl" className="text-[#718397] text-[13px] mt-1">
            דברי תורה יומיים
          </span>
          <div className="w-full h-[7px] rounded-full bg-[#EAF0F4] mt-3 overflow-hidden">
            <div
              className="h-full bg-[#2AAE9B] rounded-full transition-all duration-300"
              style={{ width: `${streakProgress * 100}%` }}
            />
          </div>
        </div>
        <ProgressRing progress={streakProgress} size={82} strokeWidth={8}>
          <AppIcon name="book" size={18} color={colors.teal} />
          <span className="text-[#17324D] text-[11px] font-black mt-0.5">{derived.torahStreak}/30</span>
        </ProgressRing>
      </Card>

      <div className="flex flex-row gap-3">
        <RelatedCard
          title="שיעור קצר"
          subtitle="3-5 דקות"
          icon="play"
          color={colors.primary}
          background={colors.blueSoft}
          onPress={toggleSpeech}
        />
        <RelatedCard
          title="מחשבה נוספת"
          subtitle="עוד רעיון להשראה"
          icon="leaf"
          color={colors.green}
          background={colors.greenSoft}
        />
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  active = false,
  onPress,
}: {
  label: string;
  icon: 'play' | 'pause' | 'share' | 'bookmark';
  active?: boolean;
  onPress: () => void | Promise<void>;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`flex-1 min-h-[46px] rounded-[16px] border flex flex-row-reverse items-center justify-center gap-1 transition-colors ${
        active
          ? 'bg-[#E8F8F4] border-[#BDECE3]'
          : 'bg-[#EAF4FB] border-[#DDE8EE] hover:bg-[#D9EEF7]'
      }`}
    >
      <AppIcon name={icon} size={19} color={active ? colors.teal : colors.primary} />
      <span className={`text-[13px] font-extrabold ${active ? 'text-[#2AAE9B]' : 'text-[#1B6F8F]'}`}>
        {label}
      </span>
    </button>
  );
}

function RelatedCard({
  title,
  subtitle,
  icon,
  color,
  background,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: 'play' | 'leaf';
  color: string;
  background: string;
  onPress?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className="flex-1 min-h-[118px] rounded-[22px] p-4 flex flex-col items-end border border-[#DDE8EE] hover:opacity-90 transition-opacity"
      style={{ backgroundColor: background }}
    >
      <div className="w-[38px] h-[38px] rounded-full bg-white flex items-center justify-center mb-2">
        <AppIcon name={icon} size={22} color={color} />
      </div>
      <span dir="rtl" className="text-[#17324D] text-[15px] font-black">
        {title}
      </span>
      <span dir="rtl" className="text-[#718397] text-[11px] mt-0.5">
        {subtitle}
      </span>
    </button>
  );
}
