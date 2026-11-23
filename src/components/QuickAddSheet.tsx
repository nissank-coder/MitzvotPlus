import React from 'react';
import { quickMitzvot } from '../data';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { AppIcon } from './AppIcon';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function QuickAddSheet({ visible, onClose }: Props) {
  const { addMitzvah, addBlessing } = useAppStore();

  if (!visible) return null;

  const add = (item: (typeof quickMitzvot)[number]) => {
    if (item.key === 'blessing') {
      addBlessing('enjoyment');
    } else {
      addMitzvah(item.title, item.icon, item.points, item.key);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0C1F30]/35"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="הוספת מצווה"
    >
      <div
        className="w-full max-w-[460px] bg-white rounded-t-[28px] px-5 pt-2 pb-8 card-shadow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-[5px] rounded-full bg-[#DDE8EE] mx-auto mb-4" />

        <div className="flex flex-row items-center justify-between mb-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="w-[38px] h-[38px] rounded-full bg-[#F4F8FB] flex items-center justify-center hover:bg-[#EAF0F4] transition-colors"
          >
            <AppIcon name="close" size={19} color={colors.textMuted} />
          </button>
          <div className="flex flex-col items-end">
            <h2 dir="rtl" className="text-[#17324D] text-[24px] font-black leading-tight">
              הוספת מצווה
            </h2>
            <p dir="rtl" className="text-[#718397] text-[13px] mt-0.5">
              בחרו פעולה והיא תתווסף להיום
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3" dir="rtl">
          {quickMitzvot.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => add(item)}
              className="min-h-[132px] rounded-[22px] border border-[#DDE8EE] bg-white flex flex-col items-center justify-center p-3 hover:border-[#2AAE9B] hover:bg-[#F7FCFF] transition-colors"
            >
              <div
                className="w-[46px] h-[46px] rounded-[16px] flex items-center justify-center mb-2"
                style={{ backgroundColor: item.background }}
              >
                <AppIcon name={item.icon} size={24} color={item.color} />
              </div>
              <span dir="rtl" className="text-[#17324D] text-[15px] font-extrabold">
                {item.title}
              </span>
              <div className="mt-2 px-2 py-1 rounded-full bg-[#FFF5DB]">
                <span className="text-[#9A6A00] text-[11px] font-extrabold">+{item.points} נק׳</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
