import React from 'react';
import { colors } from '../theme';
import { IconName } from '../types';
import { AppIcon } from './AppIcon';

type Props = {
  title: string;
  icon?: IconName;
  actionLabel?: string;
  onAction?: () => void;
};

export function SectionHeader({ title, icon, actionLabel, onAction }: Props) {
  return (
    <div className="flex flex-row items-center justify-between mb-3">
      {/* A label without an action is text, not a (disabled) button; an action is a 44px target. */}
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} className="min-h-[44px] flex flex-row items-center gap-0.5 bg-transparent border-0 px-1 hover:opacity-80">
          <AppIcon name="chevronLeft" size={16} color={colors.primary} />
          <span dir="rtl" className="text-[#1B6F8F] text-[13px] font-bold">
            {actionLabel}
          </span>
        </button>
      ) : actionLabel ? (
        <span dir="rtl" className="text-[#1B6F8F] text-[13px] font-bold">
          {actionLabel}
        </span>
      ) : (
        <div />
      )}
      <div className="flex flex-row-reverse items-center gap-2">
        <h2 dir="rtl" className="text-[#17324D] text-[20px] font-black leading-tight">
          {title}
        </h2>
        {icon ? <AppIcon name={icon} size={20} color={colors.primary} /> : null}
      </div>
    </div>
  );
}
