import React from 'react';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { AppIcon } from './AppIcon';

export function AppHeader({ onProfilePress }: { onProfilePress?: () => void }) {
  const { state, derived } = useAppStore();

  return (
    <header className="min-h-[68px] flex flex-row items-center justify-between mb-4">
      <div className="flex-1 flex flex-row items-center">
        <div
          role="img"
          aria-label={`${derived.totalPoints.toLocaleString('he-IL')} נקודות התמדה`}
          className="flex flex-row items-center gap-2 bg-white px-3 py-2 rounded-full border border-[#DDE8EE]"
        >
          <AppIcon name="coin" size={18} color={colors.gold} strokeWidth={2} />
          <span className="text-[#17324D] text-[13px] font-extrabold">
            {derived.totalPoints.toLocaleString('he-IL')}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center w-[112px]" aria-label="מצוות פלוס">
        <span dir="rtl" className="text-[#17324D] text-[24px] font-black tracking-[-0.6px] leading-tight">
          מצוות<span className="text-[#2AAE9B]">+</span>
        </span>
        <div className="mt-0.5 w-12 h-[3px] rounded-full bg-[#2AAE9B] -rotate-3" />
      </div>

      <button
        type="button"
        onClick={onProfilePress}
        className="flex-1 flex flex-row items-center justify-end text-right bg-transparent border-0 p-0"
      >
        <div className="flex flex-col items-end mr-2">
          <span dir="rtl" className="text-[#17324D] text-[13px] font-extrabold leading-tight">
            שלום {state.userName}
          </span>
          <span dir="rtl" className="text-[#718397] text-[11px] mt-0.5 leading-tight">
            ממשיכים קדימה
          </span>
        </div>
        <div className="w-[38px] h-[38px] rounded-full flex items-center justify-center bg-[#D9EEF7] border-2 border-white shrink-0">
          <span className="text-[17px] text-[#14536C] font-black">{state.userName.charAt(0)}</span>
        </div>
      </button>
    </header>
  );
}
