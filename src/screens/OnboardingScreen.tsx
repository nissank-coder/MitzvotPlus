import React, { useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ProfileFields } from '../components/ProfileFields';
import { DEFAULT_CITY_ID } from '../data/locations';
import { UserProfile } from '../types';
import { FEATURES } from '../config/features';
import { CitySilhouette } from '../components/Decorations';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

const goalOptions = [
  { value: 6, label: 'מתחיל', subtitle: '6 ביום' },
  { value: 12, label: 'מתמיד', subtitle: '12 ביום' },
  { value: 18, label: 'מאתגר', subtitle: '18 ביום' },
];

export function OnboardingScreen() {
  const { completeOnboarding, loadDemo } = useAppStore();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(12);
  const [profile, setProfile] = useState<UserProfile>({ gender: 'male', nusach: 'sefard', cityId: DEFAULT_CITY_ID });
  const canStart = name.trim().length > 0;

  return (
    <div dir="rtl" className="min-h-dvh max-w-[460px] mx-auto flex flex-col bg-[#F4F8FB] px-5 pt-10 pb-8">
      <div className="relative rounded-[28px] overflow-hidden border border-[#D5E8EC] p-6 mb-6 bg-gradient-to-b from-[#F7FCFF] to-[#E7F5F5] card-shadow">
        <CitySilhouette opacity={0.2} />
        <div className="relative z-10 flex flex-col items-start">
          <div className="text-[#17324D] text-[38px] font-black leading-none">
            מצוות<span className="text-[#2AAE9B]">+</span>
          </div>
          <p className="text-[#17324D] text-[17px] font-extrabold mt-3">מוסיפים עוד מצווה, כל יום</p>
          <p className="text-[#718397] text-[13px] mt-1 leading-5">
            מעקב אחר מצוות, ברכות ולימוד, עם יעדים אישיים וחברים שמתחזקים יחד.
          </p>
        </div>
      </div>

      <Card className="p-5 mb-4">
        <label htmlFor="onboarding-name" className="text-[#17324D] text-[15px] font-black">
          איך לקרוא לך?
        </label>
        <input
          id="onboarding-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={30}
          placeholder="שם או כינוי"
          className="w-full mt-2 min-h-[48px] rounded-[16px] border border-[#DDE8EE] px-4 text-[15px] text-[#17324D] outline-none focus:border-[#2AAE9B]"
        />

        <p className="text-[#17324D] text-[15px] font-black mt-5">יעד מצוות יומי</p>
        <div className="flex flex-row gap-2 mt-2">
          {goalOptions.map((option) => {
            const active = goal === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setGoal(option.value)}
                aria-pressed={active}
                className={`flex-1 min-h-[64px] rounded-[18px] border flex flex-col items-center justify-center transition-colors ${
                  active ? 'bg-[#2AAE9B] border-[#2AAE9B]' : 'bg-white border-[#DDE8EE] hover:bg-[#EAF4FB]'
                }`}
              >
                <span className={`text-[15px] font-black ${active ? 'text-white' : 'text-[#17324D]'}`}>{option.label}</span>
                <span className={`text-[11px] mt-0.5 ${active ? 'text-white' : 'text-[#718397]'}`}>{option.subtitle}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5">
          <ProfileFields value={profile} onChange={(patch) => setProfile((p) => ({ ...p, ...patch }))} />
        </div>
        <p className="text-[#718397] text-[11px] mt-3">אפשר לשנות בכל עת בפרופיל.</p>
      </Card>

      <button
        type="button"
        disabled={!canStart}
        onClick={() => completeOnboarding(name, goal, profile)}
        className="w-full min-h-[54px] rounded-full bg-[#2AAE9B] text-white text-[16px] font-black flex flex-row items-center justify-center gap-2 disabled:opacity-45 hover:opacity-90 transition-opacity"
      >
        בואו נתחיל
        <AppIcon name="chevronLeft" size={19} color={colors.white} />
      </button>
{FEATURES.demoContent ? (
      <button
        type="button"
        onClick={loadDemo}
        className="w-full min-h-[48px] mt-3 rounded-full bg-transparent text-[#1B6F8F] text-[14px] font-extrabold hover:bg-[#EAF4FB] transition-colors"
      >
        רק להציץ – הצגת נתוני הדגמה
      </button>
      ) : null}

      <p className="text-[#718397] text-[11px] text-center mt-auto pt-6 leading-5">
        הניקוד הוא כלי לעידוד בלבד. ״הוי זהיר במצוה קלה כבחמורה, שאין אתה יודע מתן שכרן של מצוות״ (אבות ב, א)
      </p>
    </div>
  );
}
