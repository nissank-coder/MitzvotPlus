import React, { useEffect, useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { Card } from '../components/Card';
import { SectionHeader } from '../components/SectionHeader';
import { ActionRow, Chip, ExternalLink, FeatureScreen, Notice } from '../components/ui';
import { actionDef } from '../data/actions';
import { addDays } from '../lib/dates';
import { fetchSefariaText, TrackItem, trackItem, TRACKS } from '../lib/learning';
import { useAppStore } from '../store/AppStore';
import { colors } from '../theme';

type Props = { onBack: () => void; onOpenProfile: () => void };

export function LearningScreen({ onBack, onOpenProfile }: Props) {
  const { state, derived, calendar, addAction, toggleTrack } = useAppStore();
  const [reading, setReading] = useState<TrackItem | null>(null);
  const [editing, setEditing] = useState(false);
  const il = calendar.city.il;

  const items = TRACKS.filter((t) => state.learningTracks.includes(t.key))
    .map((t) => trackItem(t, derived.todayKey, il))
    .filter((i): i is TrackItem => i !== null);

  const doneRefs = new Set(state.logs.filter((l) => l.actionKey === 'learningTrack').map((l) => l.refId));
  const streak = (trackKey: string) => {
    let n = 0;
    let key = doneRefs.has(`${trackKey}:${derived.todayKey}`) ? derived.todayKey : addDays(derived.todayKey, -1);
    while (doneRefs.has(`${trackKey}:${key}`) && n < 999) {
      n += 1;
      key = addDays(key, -1);
    }
    return n;
  };

  return (
    <FeatureScreen title="לימוד יומי" subtitle="מסלולי לימוד קבועים, כל יום" icon="bookmark" onBack={onBack} onOpenProfile={onOpenProfile}>
      <Card className="p-4 mb-4">
        <SectionHeader title="הלימוד שלי היום" icon="book" actionLabel={editing ? 'סיום' : 'עריכת מסלולים'} onAction={() => setEditing((v) => !v)} />
        {editing ? (
          <div dir="rtl" className="flex flex-row flex-wrap gap-2 mb-2">
            {TRACKS.map((t) => (
              <Chip key={t.key} active={state.learningTracks.includes(t.key)} onPress={() => toggleTrack(t.key)}>
                {t.title}
              </Chip>
            ))}
          </div>
        ) : null}
        {items.length === 0 ? (
          <p dir="rtl" className="text-[#718397] text-[13px] py-3">בחרו מסלול לימוד אחד לפחות.</p>
        ) : (
          items.map((item, i) => {
            const done = doneRefs.has(item.refId);
            const s = streak(item.track.key);
            return (
              <ActionRow
                key={item.refId}
                icon="bookmark"
                title={item.track.title}
                subtitle={`${item.label}${s > 0 ? ` · ${s} ימים ברצף` : ''}`}
                points={actionDef('learningTrack').points}
                done={done}
                color={colors.purple}
                background={colors.purpleSoft}
                onPress={() => addAction('learningTrack', { refId: item.refId, title: `${item.track.title}: ${item.label}` })}
                trailing={
                  item.url ? (
                    <button
                      type="button"
                      onClick={() => setReading(item)}
                      aria-label={`קריאה: ${item.track.title}`}
                      className="w-9 h-9 rounded-full bg-[#F0EEFB] flex items-center justify-center shrink-0 hover:opacity-80"
                    >
                      <AppIcon name="book" size={17} color={colors.purple} />
                    </button>
                  ) : null
                }
                last={i === items.length - 1}
              />
            );
          })
        )}
      </Card>

      {reading ? <Reader item={reading} onClose={() => setReading(null)} /> : null}
      <Notice>לוחות הלימוד מחושבים במכשיר. הטקסטים נטענים מספריא (Sefaria) כשיש חיבור לאינטרנט.</Notice>
    </FeatureScreen>
  );
}

function Reader({ item, onClose }: { item: TrackItem; onClose: () => void }) {
  const [text, setText] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!item.url) return;
    const controller = new AbortController();
    setText(null);
    setFailed(false);
    fetchSefariaText(item.url, controller.signal)
      .then(setText)
      .catch((e: unknown) => {
        if ((e as { name?: string }).name !== 'AbortError') setFailed(true);
      });
    return () => controller.abort();
  }, [item.url]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0C1F30]/35" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.track.title}>
      <div dir="rtl" className="w-full max-w-[460px] max-h-[85dvh] overflow-y-auto bg-white rounded-t-[28px] px-5 pt-2 pb-8 card-shadow" onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-[5px] rounded-full bg-[#DDE8EE] mx-auto mb-4" />
        <h2 className="text-[#17324D] text-[20px] font-black">{item.track.title}</h2>
        <p className="text-[#7D78C9] text-[13px] font-extrabold mb-3">{item.label}</p>
        {text ? (
          <div className="flex flex-col gap-3">
            {text.map((p, i) => (
              <p key={i} className="text-[#17324D] text-[17px] leading-8">{p}</p>
            ))}
          </div>
        ) : failed ? (
          <p className="text-[#718397] text-[14px]">לא ניתן לטעון את הטקסט כעת.</p>
        ) : (
          <p className="text-[#718397] text-[14px]">טוען…</p>
        )}
        {item.url ? (
          <div className="mt-4">
            <ExternalLink href={item.url}>פתיחה בספריא</ExternalLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}
