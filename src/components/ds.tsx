import React, { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { ds } from '../theme';
import { IconName } from '../types';
import { AppIcon } from './AppIcon';
import { ProgressRing } from './ProgressRing';

/**
 * Shared building blocks of the design round (26.11.2026): one visual language for Home, the
 * add sheet, 100 blessings, Dvar Torah and the speech guard. Colours come from the @theme tokens
 * in src/index.css (bg-brand, text-ink, …); see docs/design/DESIGN_SYSTEM_HE.md.
 */

/** A number inside Hebrew text: tabular digits, isolated direction (e.g. "+25", "3/7", "12:30"). */
export function Num({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return (
    <bdi dir="ltr" className={`num ${className}`}>
      {children}
    </bdi>
  );
}

/** Screen title with a back button (inner screens). The title is the h1 of the screen. */
export function ScreenHeader({ title, subtitle, onBack, trailing }: { title: string; subtitle?: string; onBack: () => void; trailing?: ReactNode }) {
  return (
    <header dir="rtl" className="flex flex-row items-center gap-3 min-h-[56px]">
      <button
        type="button"
        onClick={onBack}
        aria-label="חזרה"
        className="w-12 h-12 rounded-full bg-surface border border-line flex items-center justify-center shrink-0 active:bg-brand-soft"
      >
        <AppIcon name="chevronRight" size={22} color={ds.brand} />
      </button>
      <div className="flex-1 min-w-0 flex flex-col">
        <h1 className="text-[22px] leading-tight font-extrabold text-ink truncate">{title}</h1>
        {subtitle ? <p className="text-[13px] text-ink-muted leading-5">{subtitle}</p> : null}
      </div>
      {trailing}
    </header>
  );
}

type SurfaceTone = 'white' | 'brand' | 'soft';
export function Surface({ children, className = '', tone = 'white', as: Tag = 'div', ...rest }: PropsWithChildren<{ className?: string; tone?: SurfaceTone; as?: 'div' | 'section' | 'article' }> & React.HTMLAttributes<HTMLElement>) {
  const toneCls = tone === 'brand' ? 'bg-brand text-on-brand ds-shadow-strong' : tone === 'soft' ? 'bg-brand-soft' : 'bg-surface border border-line ds-shadow';
  return (
    <Tag className={`rounded-[var(--radius-card)] ${toneCls} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Progress ring: lime on the blue hero, deep lime on light surfaces. The number goes inside. */
export function Ring({ value, max, size = 120, stroke = 12, onBrand = false, children }: PropsWithChildren<{ value: number; max: number; size?: number; stroke?: number; onBrand?: boolean }>) {
  const progress = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <ProgressRing progress={progress} size={size} strokeWidth={stroke} color={onBrand ? ds.lime : ds.limeDeep} trackColor={onBrand ? 'rgba(255,255,255,0.16)' : ds.track}>
      {children}
    </ProgressRing>
  );
}

/** Horizontal progress bar with an accessible value; the number is always shown next to it. */
export function Meter({ value, max, onBrand = false, label, className = '' }: { value: number; max: number; onBrand?: boolean; label: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`h-2.5 rounded-full overflow-hidden ${onBrand ? 'bg-white/15' : 'bg-track'} ${className}`}
    >
      <div className={`h-full rounded-full transition-[width] duration-500 ${onBrand ? 'bg-lime' : 'bg-lime-deep'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

type ButtonVariant = 'primary' | 'lime' | 'secondary' | 'ghost' | 'danger' | 'onBrand';
const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand active:bg-brand-press disabled:bg-[#A9B3CC]',
  lime: 'bg-lime text-ink active:brightness-95 disabled:opacity-60',
  secondary: 'bg-surface text-brand border border-brand-line active:bg-brand-soft disabled:text-ink-muted',
  ghost: 'bg-transparent text-brand active:bg-brand-soft',
  danger: 'bg-surface text-danger border border-[#F0C9C3] active:bg-danger-soft',
  onBrand: 'bg-white/12 text-on-brand border border-white/25 active:bg-white/20',
};
export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; icon?: IconName }) {
  const sizeCls = size === 'lg' ? 'min-h-[56px] px-6 text-[16px] rounded-[18px]' : size === 'sm' ? 'min-h-[44px] px-4 text-[14px] rounded-full' : 'min-h-[48px] px-5 text-[15px] rounded-[16px]';
  const iconColor = variant === 'primary' || variant === 'onBrand' ? ds.white : variant === 'lime' ? ds.ink : variant === 'danger' ? ds.danger : ds.brand;
  return (
    <button type="button" className={`inline-flex flex-row items-center justify-center gap-2 font-bold transition-colors ${sizeCls} ${VARIANT[variant]} ${className}`} {...rest}>
      {icon ? <AppIcon name={icon} size={size === 'sm' ? 18 : 20} color={iconColor} strokeWidth={2.2} /> : null}
      {children}
    </button>
  );
}

/** "פרטי · נשמר רק במכשיר": shown wherever private data is on screen. */
export function PrivacyBadge({ children = 'פרטי · נשמר רק במכשיר הזה', onBrand = false }: { children?: ReactNode; onBrand?: boolean }) {
  return (
    <span className={`inline-flex flex-row items-center gap-1.5 rounded-full px-3 min-h-[30px] text-[12px] font-bold ${onBrand ? 'bg-white/12 text-on-brand' : 'bg-brand-soft text-brand'}`}>
      <AppIcon name="lock" size={14} color={onBrand ? ds.white : ds.brand} strokeWidth={2} />
      {children}
    </span>
  );
}

/** Section title inside a screen, with an optional link ("הכל", "התקדמות"). */
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex flex-row items-center justify-between min-h-[32px]">
      <h2 className="text-[17px] font-extrabold text-ink">{title}</h2>
      {action && onAction ? (
        <button type="button" onClick={onAction} className="min-h-[44px] px-2 -mx-2 flex flex-row items-center gap-0.5 text-[14px] font-bold text-brand">
          {action}
          <AppIcon name="chevronLeft" size={16} color={ds.brand} strokeWidth={2.2} />
        </button>
      ) : null}
    </div>
  );
}

/** Small round icon badge used in rows and tiles. */
export function IconBadge({ name, tone = 'brand', size = 40 }: { name: IconName; tone?: 'brand' | 'lime' | 'onBrand' | 'muted'; size?: number }) {
  const cls = tone === 'lime' ? 'bg-lime-soft' : tone === 'onBrand' ? 'bg-white/12' : tone === 'muted' ? 'bg-canvas' : 'bg-brand-soft';
  const color = tone === 'lime' ? ds.limeInk : tone === 'onBrand' ? ds.white : tone === 'muted' ? ds.inkMuted : ds.brand;
  return (
    <span className={`rounded-full flex items-center justify-center shrink-0 ${cls}`} style={{ width: size, height: size }} aria-hidden="true">
      <AppIcon name={name} size={Math.round(size * 0.5)} color={color} strokeWidth={2} />
    </span>
  );
}

/** Round check mark: done (lime) or open (outline). */
export function CheckMark({ done, size = 28 }: { done: boolean; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-lime' : 'border-2 border-[#B8C4DA] bg-surface'}`}
      style={{ width: size, height: size }}
    >
      {done ? <AppIcon name="check" size={Math.round(size * 0.55)} color={ds.ink} strokeWidth={3} /> : null}
    </span>
  );
}
