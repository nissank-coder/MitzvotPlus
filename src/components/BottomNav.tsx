import React from 'react';
import { ds } from '../theme';
import { IconName, TabKey } from '../types';
import { AppIcon } from './AppIcon';
import { COMMUNITY_ENABLED } from '../config/features';

// RTL: the first item in the row is on the right. היום | התקדמות | + | מסלולים | אני.
// The community demo tab exists only in development builds (COMMUNITY_ENABLED).
const allItems: Array<{ key: TabKey | 'add'; label: string; icon: IconName }> = [
  { key: 'me', label: 'אני', icon: 'user' },
  { key: 'community', label: 'קהילה', icon: 'community' },
  { key: 'tracks', label: 'מסלולים', icon: 'target' },
  { key: 'add', label: 'הוספה', icon: 'plus' },
  { key: 'progress', label: 'התקדמות', icon: 'chart' },
  { key: 'today', label: 'היום', icon: 'home' },
];
const items = allItems.filter((i) => i.key !== 'community' || COMMUNITY_ENABLED);

type Props = {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
  onAdd: () => void;
};

/** Bottom navigation (design round 1): white bar, the active tab in deep blue with a lime mark. */
export function BottomNav({ active, onSelect, onAdd }: Props) {
  return (
    <nav aria-label="ניווט ראשי" className="sticky bottom-0 z-30 min-h-[72px] flex flex-row items-stretch justify-around bg-surface border-t border-line px-1 pt-1.5 safe-bottom">
      {items.map((item) => {
        const isAdd = item.key === 'add';
        const isActive = item.key === active;
        if (isAdd) {
          return (
            <button
              key={item.key}
              type="button"
              onClick={onAdd}
              aria-label="הוספת פעולה"
              className="flex-1 flex flex-col items-center justify-start gap-1 min-h-[56px]"
            >
              <span className="w-[54px] h-[54px] -mt-[22px] rounded-full bg-brand ds-shadow-strong border-4 border-surface flex items-center justify-center active:bg-brand-press">
                <AppIcon name="plus" size={26} color={ds.white} strokeWidth={2.6} />
              </span>
              <span className="text-[11px] font-bold text-brand">{item.label}</span>
            </button>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect(item.key as TabKey)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-[56px]"
          >
            <span className={`relative w-[46px] h-[32px] rounded-full flex items-center justify-center ${isActive ? 'bg-brand-soft' : ''}`}>
              <AppIcon name={item.icon} size={22} color={isActive ? ds.brand : ds.inkMuted} strokeWidth={isActive ? 2.2 : 1.8} />
              {isActive ? <span aria-hidden="true" className="absolute -bottom-[3px] w-4 h-[3px] rounded-full bg-lime-deep" /> : null}
            </span>
            <span className={`text-[11px] ${isActive ? 'font-extrabold text-brand' : 'font-bold text-ink-muted'}`}>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
