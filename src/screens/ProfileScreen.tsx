import React, { lazy, Suspense, useState } from 'react';
import { AppHeader } from '../components/AppHeader';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ModalLayer } from '../components/Modal';
import { ProfileFields } from '../components/ProfileFields';
import { COMMUNITY_ENABLED, DEMO_CONTENT, NOTIFICATIONS_ENABLED } from '../config/features';
import { hebrewYear } from '../lib/dates';
import { useAppStore } from '../store/AppStore';
import { BUILD_INFO } from '../config/buildInfo';
import { HabitEditorSheet } from '../components/gameplay';
import { BACKEND_ENABLED } from '../backend/config';
import { exportLocalJson, saveExport } from '../lib/exportData';

// Development / staging only: production bundles contain no account or sync code.
const AccountSection = BACKEND_ENABLED ? lazy(() => import('../components/AccountSection')) : null;
import { colors } from '../theme';
import { IconName } from '../types';

export function ProfileScreen() {
  const { state, derived, updateSettings, updateGoals, updateProfile, loadDemo, resetAll } = useAppStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [demoConfirmOpen, setDemoConfirmOpen] = useState(false);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [habitsOpen, setHabitsOpen] = useState(false);
  const memberYear = hebrewYear(state.memberSince);

  return (
    <div className="flex-1 bg-canvas px-4 pb-8 pt-2">
      <AppHeader />

      <Card className="p-5 flex flex-col items-center mb-5">
        <div className="w-[82px] h-[82px] rounded-full bg-brand flex items-center justify-center border-4 border-[#E8F8F4]">
          <span className="text-white text-[32px] font-black">{state.userName.charAt(0)}</span>
        </div>
        <h1 className="text-ink text-[24px] font-black mt-3">{state.userName}</h1>
        <p dir="rtl" className="text-ink-muted text-[13px] mt-1">
          חבר במצוות+ מאז {memberYear} · שלב {derived.stage.index}: {derived.stage.name}
        </p>
        <div className="w-full flex flex-row-reverse items-center justify-around mt-5 pt-4 border-t border-line">
          <ProfileStat value={derived.totalPoints.toLocaleString('he-IL')} label="נקודות התמדה" />
          <div className="w-px h-[34px] bg-[#EAF0F4]" />
          <ProfileStat value={`${derived.activityStreak}`} label="ימי רצף" />
          <div className="w-px h-[34px] bg-[#EAF0F4]" />
          <ProfileStat value={`${derived.todayCount}`} label="פעולות היום" />
          <div className="w-px h-[34px] bg-[#EAF0F4]" />
          <ProfileStat value={derived.consistency === null ? "—" : `${derived.consistency}%`} label={derived.consistency === null ? "עקביות: עוד אין בסיס" : "עקביות (30 יום)"} />
        </div>
      </Card>

      <p dir="rtl" className="text-ink-muted text-[13px] font-extrabold text-right mb-2 mr-1">
        ההרגלים שלי
      </p>
      <Card className="px-4 mb-5">
        <SettingRow
          icon="target"
          title={derived.hasHabits ? derived.habitsToday.map((h) => h.title).join(' · ') : 'עוד לא נבחרו הרגלים'}
          subtitle="שינוי חל מהיום והלאה – ההיסטוריה לא משתנה"
          onPress={() => setHabitsOpen(true)}
        >
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>
      </Card>

      <p dir="rtl" className="text-ink-muted text-[13px] font-extrabold text-right mb-2 mr-1">
        מנהג ומיקום
      </p>
      <Card className="p-4 mb-5">
        <ProfileFields value={state.profile} onChange={updateProfile} />
      </Card>

      <p dir="rtl" className="text-ink-muted text-[13px] font-extrabold text-right mb-2 mr-1">
        הגדרות
      </p>
      <Card className="px-4 mb-5">
        {/* Hidden until reminders exist (D12): a toggle that does nothing would mislead. */}
        {NOTIFICATIONS_ENABLED ? (
        <SettingRow icon="bell" title="תזכורות יומיות" subtitle="יעדים, לימוד וברכות">
          <ToggleSwitch
            checked={state.settings.notifications}
            onChange={(notifications) => updateSettings({ notifications })}
            label="תזכורות יומיות"
          />
        </SettingRow>
        ) : null}
        {/* Only meaningful with a community (D09). */}
        {COMMUNITY_ENABLED ? (
        <SettingRow icon="lock" title="פרופיל פרטי" subtitle="הדירוג מוצג בשם פרטי בלבד">
          <ToggleSwitch
            checked={state.settings.privateProfile}
            onChange={(privateProfile) => updateSettings({ privateProfile })}
            label="פרופיל פרטי"
          />
        </SettingRow>
        ) : null}
        <SettingRow
          icon="target"
          title="היעדים שלי"
          subtitle={`${state.dailyGoal} פעולות ביום, ${state.weeklyGoal} בשבוע (מהשבוע הבא) ו-${state.blessingGoal} ברכות`}
          onPress={() => setGoalsOpen(true)}
          last
        >
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>

      </Card>

      <p dir="rtl" className="text-ink-muted text-[13px] font-extrabold text-right mb-2 mr-1">
        פרטיות ונתונים
      </p>
      <Card className="px-4 mb-5">
        <SettingRow icon="shield" title="פרטיות" subtitle="הנתונים נשמרים במכשיר בלבד">
          <span />
        </SettingRow>
{DEMO_CONTENT ? (
        <SettingRow
          icon="star"
          title="טעינת נתוני הדגמה"
          subtitle="היסטוריה לדוגמה של שלושה שבועות"
          onPress={() => setDemoConfirmOpen(true)}
        >
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>
        ) : null}
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="w-full min-h-[72px] flex flex-row items-center justify-end gap-3 bg-transparent border-0 p-0 hover:opacity-80 transition-opacity"
        >
          <span dir="rtl" className="text-[#C95B53] text-[15px] font-black">
            מחיקת כל הנתונים
          </span>
          <div className="w-[42px] h-[42px] rounded-[16px] bg-[#FDEDEA] flex items-center justify-center shrink-0">
            <AppIcon name="reset" size={20} color={colors.danger} />
          </div>
        </button>
      </Card>

      {AccountSection ? (
        <>
          <p dir="rtl" className="text-ink-muted text-[13px] font-extrabold text-right mb-2 mr-1">
            חשבון וסנכרון
          </p>
          <Card className="p-4 mb-5">
            <Suspense fallback={null}>
              <AccountSection />
            </Suspense>
          </Card>
        </>
      ) : null}

      <Card className="px-4 mb-5">
        <SettingRow
          icon="share"
          title="ייצוא הנתונים שלי"
          subtitle="קובץ עם כל מה שנשמר במכשיר (כולל מידע פרטי)"
          onPress={() => void saveExport(exportLocalJson(state))}
        >
          <AppIcon name="chevronLeft" size={19} color={colors.textMuted} />
        </SettingRow>
      </Card>

      <p dir="rtl" className="text-ink-muted text-[13px] font-extrabold text-right mb-2 mr-1">
        אודות האפליקציה
      </p>
      <Card className="p-4 mb-5">
        <dl dir="rtl" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]" aria-label="אודות האפליקציה">
          <dt className="text-ink-muted font-bold">גרסה</dt>
          <dd className="text-ink font-extrabold">{BUILD_INFO.version}</dd>
          <dt className="text-ink-muted font-bold">מצב</dt>
          <dd className="text-ink font-extrabold">
            {BUILD_INFO.mode}
            {BUILD_INFO.mode === 'Development' ? ' (שרת פיתוח)' : BUILD_INFO.mode === 'Demo' ? ' (תצוגה פנימית)' : ''}
          </dd>
          <dt className="text-ink-muted font-bold">Commit</dt>
          <dd className="text-ink font-mono text-[12px] break-all" data-testid="build-commit">
            {BUILD_INFO.commit
              ? `${BUILD_INFO.commit.slice(0, 12)} (${BUILD_INFO.commitSource === 'ci' ? 'CI' : 'git'})${BUILD_INFO.dirty ? ' + שינויים שלא נשמרו ב-commit' : ''}`
              : 'לא זמין בסביבה הזו'}
          </dd>
          <dt className="text-ink-muted font-bold">טביעת קוד</dt>
          <dd className="text-ink font-mono text-[12px]" data-testid="build-fingerprint">{BUILD_INFO.fingerprint}</dd>
          <dt className="text-ink-muted font-bold">{BUILD_INFO.kind === 'build' ? 'נבנה' : 'השרת עלה'}</dt>
          <dd className="text-ink text-[12px]">{new Date(BUILD_INFO.builtAt).toLocaleString('he-IL')}</dd>
        </dl>
        <p dir="rtl" className="text-ink-muted text-[11px] mt-3 leading-4">
          טביעת הקוד מחושבת מקבצי הקוד עצמם, ולכן זהה לכל עותק של אותו קוד. אפשר להשוות אותה לטביעה שמופיעה בסיכום ה-CI של כל commit.
        </p>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="מחיקת כל הנתונים"
        message="כל ההיסטוריה, הנקודות וההגדרות יימחקו מהמכשיר. לא ניתן לשחזר."
        confirmLabel="מחיקה"
        cancelLabel="ביטול"
        destructive
        onConfirm={resetAll}
        onClose={() => setConfirmOpen(false)}
      />

      {DEMO_CONTENT ? (
      <ConfirmDialog
        open={demoConfirmOpen}
        title="טעינת נתוני הדגמה"
        message="הנתונים הנוכחיים יוחלפו בנתוני הדגמה. להמשיך?"
        confirmLabel="טעינה"
        cancelLabel="ביטול"
        destructive
        onConfirm={loadDemo}
        onClose={() => setDemoConfirmOpen(false)}
      />
      ) : null}

      {habitsOpen ? <HabitEditorSheet onClose={() => setHabitsOpen(false)} /> : null}

      {goalsOpen && (
        <GoalsEditor
          initial={{ dailyGoal: state.dailyGoal, weeklyGoal: state.weeklyGoal, blessingGoal: state.blessingGoal }}
          onSave={(goals) => {
            updateGoals(goals);
            setGoalsOpen(false);
          }}
          onClose={() => setGoalsOpen(false)}
        />
      )}
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
        checked ? 'bg-[#BDECE3]' : 'bg-line'
      }`}
    >
      <span
        className={`block w-5 h-5 rounded-full shadow-sm transition-transform ${
          checked ? 'translate-x-6 bg-brand' : 'translate-x-1 bg-white'
        }`}
      />
    </button>
  );
}

function ProfileStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1 flex flex-col items-center">
      <span className="text-ink text-[17px] font-black">{value}</span>
      <span dir="rtl" className="text-ink-muted text-[11px] mt-1">
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
  onPress,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  last?: boolean;
  onPress?: () => void;
}) {
  const className = `w-full min-h-[78px] flex flex-row items-center gap-3 py-3 bg-transparent ${
    !last ? 'border-b border-line' : ''
  } ${onPress ? 'hover:opacity-80 transition-opacity text-right' : ''}`;
  const content = (
    <>
      <div className="min-w-[44px] flex items-center justify-start">{children}</div>
      <div className="flex-1 flex flex-col items-end">
        <span dir="rtl" className="text-ink text-[15px] font-black">
          {title}
        </span>
        <span dir="rtl" className="text-ink-muted text-[11px] mt-1 text-right">
          {subtitle}
        </span>
      </div>
      <div className="w-[42px] h-[42px] rounded-[16px] bg-brand-soft flex items-center justify-center shrink-0">
        <AppIcon name={icon} size={20} color={colors.primary} />
      </div>
    </>
  );
  if (onPress) {
    return (
      <button type="button" onClick={onPress} className={className}>
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

type Goals = { dailyGoal: number; weeklyGoal: number; blessingGoal: number };

function GoalsEditor({ initial, onSave, onClose }: { initial: Goals; onSave: (goals: Goals) => void; onClose: () => void }) {
  const [goals, setGoals] = useState<Goals>(initial);
  const rows: Array<{ key: keyof Goals; label: string; step: number; min: number; max: number }> = [
    { key: 'dailyGoal', label: 'מצוות ביום', step: 1, min: 1, max: 50 },
    { key: 'weeklyGoal', label: 'מצוות בשבוע', step: 5, min: 5, max: 300 },
    { key: 'blessingGoal', label: 'ברכות ביום', step: 10, min: 10, max: 300 },
  ];
  const change = (row: (typeof rows)[number], delta: number) =>
    setGoals((prev) => ({ ...prev, [row.key]: Math.min(row.max, Math.max(row.min, prev[row.key] + delta)) }));

  return (
    <ModalLayer
      label="עריכת יעדים"
      onClose={onClose}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-[#0C1F30]/35"
      panelClassName="w-full max-w-[460px] bg-white rounded-t-[28px] px-5 pt-2 sheet-safe card-shadow"
    >
        <div className="w-12 h-[5px] rounded-full bg-line mx-auto mb-4" />
        <h2 className="text-ink text-[20px] font-black mb-4">היעדים שלי</h2>
        {rows.map((row) => (
          <div key={row.key} className="flex flex-row items-center justify-between py-3 border-b border-line">
            <span className="text-ink text-[15px] font-extrabold">{row.label}</span>
            <div className="flex flex-row items-center gap-3">
              <button
                type="button"
                aria-label={`הגדלת ${row.label}`}
                onClick={() => change(row, row.step)}
                className="w-11 h-11 rounded-full bg-brand-soft text-brand text-[20px] font-black"
              >
                +
              </button>
              <span className="w-10 text-center text-ink text-[17px] font-black">{goals[row.key]}</span>
              <button
                type="button"
                aria-label={`הקטנת ${row.label}`}
                onClick={() => change(row, -row.step)}
                className="w-11 h-11 rounded-full bg-brand-soft text-brand text-[20px] font-black"
              >
                −
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onSave(goals)}
          className="w-full min-h-[52px] mt-5 rounded-full bg-brand text-white text-[15px] font-black hover:opacity-90"
        >
          שמירה
        </button>
    </ModalLayer>
  );
}
