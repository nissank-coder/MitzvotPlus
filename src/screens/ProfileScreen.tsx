import React, { useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { IconName } from '../types';

export function ProfileScreen() {
  const { state, resetDemo } = useAppStore();
  const [notifications, setNotifications] = useState(true);
  const [privateProfile, setPrivateProfile] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex-1 bg-[#F4F8FB] px-4 pb-8 pt-2">
      <AppHeader />

      <Card className="p-5 flex flex-col items-center mb-5">
        <div className="w-[82px] h-[82px] rounded-full bg-[#2AAE9B] flex items-center justify-center border-4 border-[#E8F8F4]">
          <span className="text-white text-[32px] font-black">{state.userName.charAt(0)}</span>
        </div>
        <h1 className="text-[#17324D] text-[24px] font-black mt-3">{state.userName}</h1>
        <p dir="rtl" className="text-[#718397] text-[13px] mt-1">
          חבר במצוות+ מאז תשפ״ה
        </p>
        <div className="w-full flex flex-row-reverse items-center justify-around mt-5 pt-4 border-t border-[#EAF0F4]">
          <ProfileStat value={state.points.toLocaleString('he-IL')} label="נקודות" />
          <div className="w-px h-[34px] bg-[#EAF0F4]" />
          <ProfileStat value={`${state.torahStreak}`} label="ימי רצף" />
          <div className="w-px h-[34px] bg-[#EAF0F4]" />
          <ProfileStat value={`${state.dailyLogs.length}`} label="היום" />
        </div>
      </Card>

      <p dir="rtl" className="text-[#718397] text-[13px] font-extrabold text-right mb-2 mr-1">
        הגדרות
      </p>
      <Card className="px-4 mb-5">
        <SettingRow icon="bell" title="תזכורות יומיות" subtitle="יעדים, לימוד וברכות">
          <ToggleSwitch checked={notifications} onChange={setNotifications} label="תזכורות יומיות" />
        </SettingRow>
        <SettingRow icon="lock" title="פרופיל פרטי" subtitle="הדירוג מוצג בשם פרטי בלבד">
          <ToggleSwitch checked={privateProfile} onChange={setPrivateProfile} label="פרופיל פרטי" />
        </SettingRow>
        <SettingRow icon="target" title="היעדים שלי" subtitle="12 מצוות ו-100 ברכות ביום">
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>
        <SettingRow icon="settings" title="העדפות" subtitle="שפה, תצוגה ונגישות" last>
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>
      </Card>

      <p dir="rtl" className="text-[#718397] text-[13px] font-extrabold text-right mb-2 mr-1">
        פרטיות ונתונים
      </p>
      <Card className="px-4 mb-5">
        <SettingRow icon="shield" title="פרטיות" subtitle="הנתונים נשמרים במכשיר בלבד">
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="w-full min-h-[72px] flex flex-row items-center justify-end gap-3 bg-transparent border-0 p-0 hover:opacity-80 transition-opacity"
        >
          <span dir="rtl" className="text-[#C95B53] text-[15px] font-black">
            איפוס נתוני ההדגמה
          </span>
          <div className="w-[42px] h-[42px] rounded-[16px] bg-[#FDEDEA] flex items-center justify-center shrink-0">
            <AppIcon name="reset" size={20} color={colors.danger} />
          </div>
        </button>
      </Card>

      <p dir="rtl" className="text-[#718397] text-[11px] text-center mt-2">
        מצוות+ גרסת אב-טיפוס 0.1.0
      </p>

      <ConfirmDialog
        open={confirmOpen}
        title="איפוס נתוני ההדגמה"
        message="האם להחזיר את האפליקציה לנתוני ההתחלה?"
        confirmLabel="איפוס"
        cancelLabel="ביטול"
        destructive
        onConfirm={resetDemo}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors ${
        checked ? 'bg-[#BDECE3]' : 'bg-[#DDE8EE]'
      }`}
    >
      <span
        className={`block w-5 h-5 rounded-full shadow-sm transition-transform ${
          checked ? 'translate-x-6 bg-[#2AAE9B]' : 'translate-x-1 bg-white'
        }`}
      />
    </button>
  );
}

function ProfileStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center">
      <span className="text-[#17324D] text-[17px] font-black">{value}</span>
      <span dir="rtl" className="text-[#718397] text-[11px] mt-1">
        {label}
      </span>
    </div>
  );
}

function SettingRow({
  icon,
  title,
  subtitle,
  children,
  last = false,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`min-h-[78px] flex flex-row items-center gap-3 py-3 ${
        !last ? 'border-b border-[#EAF0F4]' : ''
      }`}
    >
      <div className="min-w-[44px] flex items-center justify-start">{children}</div>
      <div className="flex-1 flex flex-col items-end">
        <span dir="rtl" className="text-[#17324D] text-[15px] font-black">
          {title}
        </span>
        <span dir="rtl" className="text-[#718397] text-[11px] mt-1 text-right">
          {subtitle}
        </span>
      </div>
      <div className="w-[42px] h-[42px] rounded-[16px] bg-[#EAF4FB] flex items-center justify-center shrink-0">
        <AppIcon name={icon} size={20} color={colors.primary} />
      </div>
    </div>
  );
}
