import React, { useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ChallengeCard, HabitEditorSheet } from '../components/gameplay';
import { SectionHeader } from '../components/SectionHeader';
import { DVAR_TORAH_AVAILABLE } from '../content/registry';
import { SOCIAL_ENABLED } from '../config/features';
import { CHALLENGES } from '../lib/challenges';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';
import { FeatureKey, IconName } from '../types';

type Props = { onOpenFeature: (feature: Exclude<FeatureKey, null>) => void };

const LIBRARY: Array<{ key: Exclude<FeatureKey, null>; title: string; note: string; icon: IconName }> = [
  { key: 'blessings', title: '100 ברכות', note: 'מונה ברכות לפי סוג', icon: 'cup' },
  { key: 'learning', title: 'לימוד יומי', note: 'מסלולי לימוד קבועים', icon: 'bookmark' },
  { key: 'torah', title: 'דבר תורה', note: 'תוכן מאושר בלבד', icon: 'book' },
  { key: 'speech', title: 'שמירת הלשון', note: 'טיימר פרטי במכשיר', icon: 'shield' },
  { key: 'siddur', title: 'סידור', note: 'נוסח ספרד, עובד בלי אינטרנט', icon: 'prayer' },
  { key: 'tehillim', title: 'תהילים', note: 'כל 150 הפרקים', icon: 'book' },
  { key: 'prayers', title: 'זמני תפילה', note: 'לפי העיר שבחרת', icon: 'clock' },
  { key: 'blessingGuide', title: 'איזו ברכה?', note: 'מדריך ברכות', icon: 'lightbulb' },
  { key: 'mitzvot', title: 'מצוות', note: 'לימוד מצווה ביום', icon: 'scroll' },
  { key: 'holidays', title: 'מועדים', note: 'החגים הקרובים', icon: 'calendar' },
];

/**
 * "מסלולים" (round 9, C1): active challenges, challenges to join, the habits and the library of
 * existing content (siddur, Tehillim, learning) as resources that support the habits.
 */
export function TracksScreen({ onOpenFeature }: Props) {
  const { derived, joinChallenge, leaveChallenge } = useAppStore();
  const [habitsOpen, setHabitsOpen] = useState(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const active = derived.challenges.filter((c) => c.state === 'active');
  const group = CHALLENGES.filter((c) => c.scope === 'group');
  const completed = derived.challenges.filter((c) => c.state === 'completed');

  return (
    <div dir="rtl" className="flex-1 bg-canvas px-4 pb-8 pt-4 flex flex-col gap-4">
      <header className="flex flex-col">
        <h1 className="text-[24px] font-black text-ink">מסלולים ואתגרים</h1>
        <span className="text-[13px] text-ink-muted">אתה בוחר את הקצב. אפשר לעזוב בכל רגע.</span>
      </header>

      {SOCIAL_ENABLED ? (
        <button
          type="button"
          onClick={() => onOpenFeature('together')}
          className="text-right rounded-[var(--radius-card)] bg-brand text-on-brand p-4 min-h-[64px] flex flex-row items-center gap-3"
          aria-label="לומדים יחד – אתגר לימוד פרטי עם חבר"
          data-testid="together-entry"
        >
          <AppIcon name="community" size={26} color={colors.white} />
          <span className="flex-1 flex flex-col">
            <span className="text-[16px] font-extrabold">לומדים יחד</span>
            <span className="text-[13px] text-on-brand-muted">אתגר לימוד פרטי עם חבר – 3 ימי לימוד בשבוע</span>
          </span>
          <AppIcon name="chevronLeft" size={20} color={colors.white} />
        </button>
      ) : null}

      {active.length > 0 ? (
        <section aria-label="אתגרים פעילים" className="flex flex-col gap-3">
          {active.map((c) => (
            <ChallengeCard key={c.enrollment.instanceId} view={c} onLeave={() => setLeaving(c.enrollment.instanceId)} />
          ))}
        </section>
      ) : (
        <div className="rounded-[22px] bg-[#17324D] p-4 flex flex-col gap-2">
          <span className="text-[12px] font-extrabold text-[#9FD8CF]">אין אתגר פעיל</span>
          <span className="text-[17px] font-black text-white">אתגר קטן נותן כיוון לשבוע</span>
          <span className="text-[13px] text-[#C9D6E0]">נספר רק מיום ההצטרפות. שבת וחג לא נספרים כחסרים. האתגרים לא מוסיפים נקודות.</span>
        </div>
      )}

      <section aria-label="אתגרים להצטרפות" className="flex flex-col gap-2">
        <SectionHeader title={`אתגרים אישיים (${derived.joinableChallenges.length})`} icon="target" />
        {derived.joinableChallenges.map((c) => (
          <Card key={c.id} className="p-4 flex flex-row items-center gap-3">
            <div className="flex-1 flex flex-col gap-0.5">
              <span className="text-[15px] font-extrabold text-ink">
                {c.title}
                {c.private ? <span className="text-[11px] text-brand mr-1.5">· פרטי</span> : null}
              </span>
              <span className="text-[12px] text-ink-muted">
                {c.description} · {'days' in c.window ? `${c.window.days} ימים` : 'שבוע'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => joinChallenge(c.id)}
              aria-label={`הצטרפות לאתגר: ${c.title}`}
              className="min-h-[44px] px-4 rounded-[12px] border border-brand text-brand bg-surface text-[13px] font-extrabold shrink-0"
            >
              הצטרפות
            </button>
          </Card>
        ))}
        {group.map((c) => (
          <div key={c.id} className="rounded-[var(--radius-card)] bg-canvas border border-dashed border-line p-4 flex flex-row items-center gap-3">
            <AppIcon name="community" size={22} color={colors.textMuted} />
            <div className="flex-1 flex flex-col">
              <span className="text-[14px] font-extrabold text-ink">{c.title}</span>
              <span className="text-[12px] text-ink-muted">{c.description}</span>
            </div>
            <span className="text-[12px] font-bold text-ink-muted">בקרוב</span>
          </div>
        ))}
      </section>

      <Card className="p-4 flex flex-row items-center gap-3">
        <div className="flex-1 flex flex-col">
          <span className="text-[15px] font-extrabold text-ink">ההרגלים שלי</span>
          <span className="text-[12px] text-ink-muted">
            {derived.hasHabits ? derived.habitsToday.map((h) => h.title).join(' · ') : 'עוד לא נבחרו הרגלים'}
          </span>
        </div>
        <button type="button" onClick={() => setHabitsOpen(true)} className="min-h-[44px] px-4 rounded-[12px] bg-brand text-on-brand text-[13px] font-extrabold">
          {derived.hasHabits ? 'עריכה' : 'בחירה'}
        </button>
      </Card>

      {completed.length > 0 ? (
        <section aria-label="הושלמו" className="flex flex-col gap-2">
          <SectionHeader title={`הושלמו (${completed.length})`} icon="trophy" />
          {completed.map((c) => (
            <ChallengeCard key={c.enrollment.instanceId} view={c} compact />
          ))}
        </section>
      ) : null}

      <section aria-label="ספרייה" className="flex flex-col gap-2">
        <SectionHeader title="ספרייה וכלים" icon="book" />
        <div className="grid grid-cols-2 gap-2">
          {LIBRARY.filter((i) => i.key !== 'torah' || DVAR_TORAH_AVAILABLE).map((i) => (
            <button
              key={i.key}
              type="button"
              onClick={() => onOpenFeature(i.key)}
              className="min-h-[72px] rounded-[18px] bg-white border border-line p-3 flex flex-row items-center gap-2.5 text-right"
            >
              <AppIcon name={i.icon} size={20} color={colors.primary} />
              <span className="flex flex-col">
                <span className="text-[14px] font-extrabold text-ink">{i.title}</span>
                <span className="text-[11px] text-ink-muted">{i.note}</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={leaving !== null}
        title="עזיבת האתגר"
        message="ההתקדמות עד עכשיו נשמרת בהיסטוריה. אפשר להצטרף שוב בהמשך."
        confirmLabel="עזיבה"
        cancelLabel="להישאר"
        onConfirm={() => {
          if (leaving) leaveChallenge(leaving);
          setLeaving(null);
        }}
        onClose={() => setLeaving(null)}
      />
      {habitsOpen ? <HabitEditorSheet onClose={() => setHabitsOpen(false)} /> : null}
    </div>
  );
}
