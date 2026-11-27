import React, { PropsWithChildren } from 'react';
import { colors } from '../theme';
import { IconName } from '../types';
import { AppHeader } from './AppHeader';
import { AppIcon } from './AppIcon';
import { FeatureHeader } from './FeatureHeader';

/** Standard layout for a feature screen reached from a tab. */
export function FeatureScreen({
  title,
  subtitle,
  icon,
  onBack,
  onOpenProfile,
  children,
}: PropsWithChildren<{ title: string; subtitle?: string; icon: IconName; onBack: () => void; onOpenProfile?: () => void }>) {
  return (
    <div className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-2">
      <AppHeader onProfilePress={onOpenProfile} />
      <FeatureHeader title={title} subtitle={subtitle} icon={icon} onBack={onBack} />
      {children}
    </div>
  );
}

/** A tappable row for marking a mitzvah as done. */
export function ActionRow({
  icon,
  title,
  subtitle,
  points,
  done,
  disabled,
  onPress,
  color = colors.primary,
  background = colors.blueSoft,
  trailing,
  last,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  points?: number;
  done?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  color?: string;
  background?: string;
  trailing?: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      dir="rtl"
      className={`min-h-[62px] flex flex-row items-center gap-3 py-2 ${last ? '' : 'border-b border-[#EAF0F4]'}`}
    >
      <div
        className="w-[40px] h-[40px] rounded-[14px] flex items-center justify-center shrink-0"
        style={{ backgroundColor: done ? colors.greenSoft : background }}
      >
        <AppIcon name={done ? 'check' : icon} size={20} color={done ? colors.green : color} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col items-start">
        <span className={`text-[15px] font-extrabold ${done ? 'text-[#718397] line-through decoration-1' : 'text-[#17324D]'}`}>
          {title}
        </span>
        {subtitle ? <span className="text-[#718397] text-[11px] mt-0.5 leading-4">{subtitle}</span> : null}
      </div>
      {trailing}
      {onPress ? (
        <button
          type="button"
          onClick={onPress}
          disabled={disabled || done}
          aria-label={done ? `${title} – בוצע` : `סימון: ${title}`}
          className={`min-w-[64px] min-h-[44px] px-3 rounded-full text-[12px] font-black transition-colors shrink-0 ${
            done
              ? 'bg-[#EAF7EF] text-[#4DAA78]'
              : disabled
                ? 'bg-[#F4F8FB] text-[#A7B4C0]'
                : 'bg-[#2AAE9B] text-white hover:bg-[#239988]'
          }`}
        >
          {done ? 'בוצע' : points !== undefined ? `+${points}` : 'סימון'}
        </button>
      ) : null}
    </div>
  );
}

export function Chip({ children, active, onPress }: PropsWithChildren<{ active?: boolean; onPress?: () => void }>) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-pressed={active}
      className={`min-h-[44px] px-3 rounded-full border text-[13px] font-extrabold whitespace-nowrap transition-colors ${
        active ? 'bg-[#2AAE9B] border-[#2AAE9B] text-white' : 'bg-white border-[#DDE8EE] text-[#17324D] hover:bg-[#EAF4FB]'
      }`}
    >
      {children}
    </button>
  );
}

export function ExternalLink({ href, children }: PropsWithChildren<{ href: string }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex flex-row items-center gap-1 text-[#1B6F8F] text-[13px] font-extrabold hover:underline"
    >
      {children}
      <AppIcon name="chevronLeft" size={14} color={colors.primary} />
    </a>
  );
}

export function Notice({ children }: PropsWithChildren) {
  return (
    <p dir="rtl" className="text-[#718397] text-[11px] leading-5 text-right mt-3 px-1">
      {children}
    </p>
  );
}
