import React, { useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { CitySilhouette } from '../components/Decorations';
import { HabitPicker } from '../components/gameplay';
import { ProfileFields } from '../components/ProfileFields';
import { DEMO_CONTENT } from '../config/features';
import { DEFAULT_CITY_ID } from '../data/locations';
import { SUGGESTED_HABITS } from '../lib/habits';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { HabitSelection, UserProfile } from '../types';

/**
 * Onboarding (round 9, B1): name → 2–3 personal habits (1–5 allowed, frequency per habit) →
 * details for prayer times (optional). No account, no promise of friends, no fixed number goal.
 */
export function OnboardingScreen() {
  const { completeOnboarding, loadDemo } = useAppStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState('');
  const [habits, setHabits] = useState<HabitSelection[]>([]);
  const [profile, setProfile] = useState<UserProfile>({ gender: 'male', nusach: 'sefard', cityId: DEFAULT_CITY_ID });

  const progress = (
    <div className="flex flex-row gap-1.5 mb-4" aria-label={`שלב ${step} מתוך 3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={`flex-1 h-[5px] rounded-full ${i <= step ? 'bg-brand' : 'bg-line'}`} />
      ))}
    </div>
  );

  return (
    <div dir="rtl" className="min-h-dvh max-w-[460px] mx-auto flex flex-col bg-canvas px-5 pt-8 pb-8">
      {progress}

      {step === 1 ? (
        <>
          <div className="relative rounded-[28px] overflow-hidden border border-[#D5E8EC] p-6 mb-5 bg-gradient-to-b from-[#F7FCFF] to-[#E7F5F5] card-shadow">
            <CitySilhouette opacity={0.2} />
            <div className="relative z-10 flex flex-col items-start">
              <div className="text-ink text-[38px] font-black leading-none">
                מצוות<span className="text-brand">+</span>
              </div>
              <p className="text-ink text-[17px] font-extrabold mt-3">להתמיד בהרגלים שחשובים לך</p>
              <p className="text-ink-muted text-[13px] mt-1 leading-5">
                בוחרים 2–3 הרגלים, רושמים מה שנעשה, ורואים התקדמות אמיתית – יום אחרי יום.
              </p>
            </div>
          </div>
          <Card className="p-5 mb-4">
            <label htmlFor="onboarding-name" className="text-ink text-[15px] font-black">
              איך לקרוא לך?
            </label>
            <input
              id="onboarding-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              placeholder="שם או כינוי"
              className="w-full mt-2 min-h-[48px] rounded-[16px] border border-line px-4 text-[15px] text-ink outline-none focus:border-brand"
            />
            <p className="text-ink-muted text-[12px] mt-2">אין צורך בחשבון. הנתונים נשמרים במכשיר.</p>
          </Card>
          <PrimaryButton disabled={name.trim().length === 0} onPress={() => setStep(2)}>
            המשך
          </PrimaryButton>
          {DEMO_CONTENT ? (
            <button type="button" onClick={loadDemo} className="w-full min-h-[48px] mt-3 rounded-full text-brand text-[14px] font-extrabold">
              רק להציץ – הצגת נתוני הדגמה
            </button>
          ) : null}
        </>
      ) : null}

      {step === 2 ? (
        <>
          <h1 className="text-[24px] font-black text-ink">במה תרצה להתמיד?</h1>
          <p className="text-[14px] text-ink-muted mt-1 mb-4">מומלץ 2–3 הרגלים. אפשר להתחיל באחד ולשנות בכל זמן.</p>
          {habits.length === 0 ? (
            <button
              type="button"
              onClick={() => setHabits(SUGGESTED_HABITS.map((id) => ({ id, perWeek: 7 })))}
              className="self-start mb-4 min-h-[44px] px-4 rounded-full border border-brand text-brand text-[13px] font-extrabold bg-surface"
            >
              הצעה להתחלה: תפילה, לימוד וחסד
            </button>
          ) : null}
          <HabitPicker value={habits} onChange={setHabits} gender={profile.gender} />
          <div className="sticky bottom-0 bg-canvas pt-4 flex flex-row gap-2">
            <SecondaryButton onPress={() => setStep(1)}>חזרה</SecondaryButton>
            <PrimaryButton disabled={habits.length === 0} onPress={() => setStep(3)}>
              {habits.length === 0 ? 'בחרו הרגל אחד לפחות' : `המשך (${habits.length} נבחרו)`}
            </PrimaryButton>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <h1 className="text-[24px] font-black text-ink">כמה פרטים, לפי הצורך</h1>
          <p className="text-[14px] text-ink-muted mt-1 mb-4">העיר והנוסח משמשים לזמני תפילה ולסידור. אפשר לשנות בכל עת.</p>
          <Card className="p-5 mb-4">
            <ProfileFields value={profile} onChange={(patch) => setProfile((p) => ({ ...p, ...patch }))} />
          </Card>
          <Card className="p-4 mb-4 flex flex-col gap-1">
            <span className="text-[14px] font-extrabold text-ink">100 ברכות – אתגר נפרד</span>
            <span className="text-[12px] text-ink-muted">מונה הברכות זמין תמיד במסך היום, בלי קשר להרגלים שבחרת.</span>
          </Card>
          <div className="flex flex-row gap-2">
            <SecondaryButton onPress={() => setStep(2)}>חזרה</SecondaryButton>
            <PrimaryButton onPress={() => completeOnboarding(name, 12, profile, habits)}>
              מתחילים
              <AppIcon name="chevronLeft" size={19} color={colors.white} />
            </PrimaryButton>
          </div>
        </>
      ) : null}

      <p className="text-ink-muted text-[11px] text-center mt-auto pt-6 leading-5">
        הניקוד הוא כלי לעידוד בלבד. ״הוי זהיר במצוה קלה כבחמורה, שאין אתה יודע מתן שכרן של מצוות״ (אבות ב, א)
      </p>
    </div>
  );
}

function PrimaryButton({ children, onPress, disabled }: { children: React.ReactNode; onPress: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPress}
      className="[.flex-row>&]:flex-[2] w-full min-h-[54px] rounded-full bg-brand text-white text-[16px] font-black flex flex-row items-center justify-center gap-2 disabled:opacity-45"
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onPress }: { children: React.ReactNode; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} className="flex-1 min-h-[54px] rounded-full border border-line bg-white text-ink text-[15px] font-extrabold">
      {children}
    </button>
  );
}
