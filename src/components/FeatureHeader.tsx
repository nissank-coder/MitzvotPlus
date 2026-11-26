import React from 'react';
import { colors } from '../theme';
import { IconName } from '../types';
import { AppIcon } from './AppIcon';

type Props = {
  title: string;
  subtitle?: string;
  icon: IconName;
  onBack: () => void;
};

export function FeatureHeader({ title, subtitle, icon, onBack }: Props) {
  return (
    <div className="flex flex-row-reverse items-center justify-between mb-4">
      <button
        type="button"
        onClick={onBack}
        aria-label="חזרה"
        className="w-11 h-11 rounded-full flex items-center justify-center bg-white border border-[#DDE8EE] hover:bg-[#EAF4FB] transition-colors shrink-0"
      >
        <AppIcon name="chevronRight" size={21} color={colors.primary} />
      </button>
      <div className="flex-1 mr-3 flex flex-col items-end">
        <div className="flex flex-row-reverse items-center gap-2">
          <div className="w-9 h-9 rounded-[16px] bg-[#EAF4FB] flex items-center justify-center shrink-0">
            <AppIcon name={icon} size={20} color={colors.primary} />
          </div>
          <h1 dir="rtl" className="text-[#17324D] text-[24px] font-black leading-tight">
            {title}
          </h1>
        </div>
        {subtitle ? (
          <p dir="rtl" className="mt-1 text-[#718397] text-[13px]">
            {subtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
