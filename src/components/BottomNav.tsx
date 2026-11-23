import React from 'react';
import { colors } from '../theme';
import { IconName, TabKey } from '../types';
import { AppIcon } from './AppIcon';
import { COMMUNITY_ENABLED } from '../config/features';

const allItems: Array<{ key: TabKey | 'add'; label: string; icon: IconName }> = [
  { key: 'profile', label: 'פרופיל', icon: 'user' },
  { key: 'community', label: 'קהילה', icon: 'community' },
  { key: 'add', label: 'הוספה', icon: 'plus' },
  { key: 'content', label: 'תוכן', icon: 'book' },
  { key: 'home', label: 'בית', icon: 'home' },
];
const items = allItems.filter((i) => i.key !== 'community' || COMMUNITY_ENABLED);

type Props = {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
  onAdd: () => void;
};

export function BottomNav({ active, onSelect, onAdd }: Props) {
  return (
    <nav className="sticky bottom-0 z-30 min-h-[74px] flex flex-row items-center justify-around bg-white border-t border-[#DDE8EE] px-2 pt-2 safe-bottom">
      {items.map((item) => {
        const isAdd = item.key === 'add';
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => (isAdd ? onAdd() : onSelect(item.key as TabKey))}
            aria-current={isActive ? 'page' : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-1 bg-transparent border-0 p-0"
          >
            <div
              className={`flex items-center justify-center rounded-[16px] transition-colors ${
                isAdd
                  ? 'w-[46px] h-[42px] -mt-[14px] bg-[#2AAE9B] shadow-md hover:bg-[#239988]'
                  : isActive
                    ? 'w-[42px] h-[34px] bg-[#EAF4FB]'
                    : 'w-[42px] h-[34px] hover:bg-[#F4F8FB]'
              }`}
            >
              <AppIcon
                name={item.icon}
                size={isAdd ? 24 : 21}
                color={isAdd ? colors.white : isActive ? colors.primary : colors.textMuted}
                strokeWidth={isAdd ? 2.2 : 1.8}
              />
            </div>
            <span
              className={`text-[11px] font-bold ${
                isActive ? 'text-[#1B6F8F]' : 'text-[#718397]'
              }`}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
