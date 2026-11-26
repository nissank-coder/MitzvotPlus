import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionKey, actionDef } from '../data/actions';
import { quickAddGroups, QuickAddItem } from '../lib/quickAdd';
import { useAppStore } from '../store/AppStore';
import { ds } from '../theme';
import { AppIcon } from './AppIcon';
import { Num } from './ds';
import { ModalLayer } from './Modal';
import type { RecordFocus } from './RecordFlow';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Round 13 (U5): opened for one habit – "which prayer?" or directly the minyan choice of one prayer. */
  focus?: RecordFocus | null;
};

const itemOf = (key: ActionKey): QuickAddItem => {
  const def = actionDef(key);
  return { key, title: def.title, detail: def.minyanBonus ? 'minyan' : null, oncePerDay: Boolean(def.oncePerDay) } as QuickAddItem;
};

/**
 * The shared add sheet (design round 1). Exact action names, grouped by category; points are a
 * secondary line. An action that needs one more choice (a prayer: in a minyan or not) asks first;
 * everything else is recorded with one tap. One tap = one entry: further taps while the sheet
 * closes are ignored. The saved confirmation (with "ביטול") comes from the toast once the entry
 * is stored on the device; a failed save shows the save banner instead.
 */
export function QuickAddSheet({ visible, onClose, focus = null }: Props) {
  const { state, derived, addAction, addBlessing, previewPoints } = useAppStore();
  const [detail, setDetail] = useState<QuickAddItem | null>(null);
  const [recorded, setRecorded] = useState<{ key: ActionKey; minyan: boolean } | null>(null);
  const busy = useRef(false);
  const groups = useMemo(() => quickAddGroups(state.profile.gender), [state.profile.gender]);

  // Every opening starts fresh: no carried-over minyan choice (A15). Opened for one prayer, the
  // sheet starts at its minyan choice.
  const single = focus && focus.actions.length === 1 ? itemOf(focus.actions[0]!) : null;
  useEffect(() => {
    if (visible) {
      busy.current = false;
      setDetail(single?.detail === 'minyan' ? single : null);
    } else {
      setDetail(null);
      setRecorded(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, focus]);

  if (!visible) return null;

  const doneToday = new Set(derived.todayLogs.map((l) => l.actionKey));
  const record = (key: ActionKey, minyan = false) => {
    if (busy.current) return; // a double tap records once
    busy.current = true;
    if (key === 'blessing') addBlessing('other');
    else addAction(key, { minyan });
    // The sheet stays a moment with the tapped item marked: a second tap of a double tap lands here
    // (and is ignored) instead of on whatever is underneath the sheet.
    setRecorded({ key, minyan });
    window.setTimeout(onClose, 350);
  };
  const isRecorded = (key: ActionKey, minyan?: boolean) => recorded?.key === key && (minyan === undefined || recorded.minyan === minyan);
  const choose = (item: QuickAddItem) => (item.detail === 'minyan' ? setDetail(item) : record(item.key));
  // A narrowed list ("which prayer?"): the habit's own actions only.
  const focusItems = focus && !single ? focus.actions.map(itemOf) : null;
  const canGoBack = detail !== null && !(single && single.key === detail.key);
  const label = detail ? `פרטי הרישום: ${detail.title}` : focusItems ? `איזו תפילה? ${focus!.title}` : 'הוספת פעולה';

  return (
    <ModalLayer
      label={label}
      onClose={() => !recorded && onClose()}
      closeOnBackdrop={!recorded}
      backdropClassName="fixed inset-0 z-50 flex items-end justify-center bg-[#0E1630]/45"
      panelClassName={`w-full max-w-[460px] max-h-[88dvh] flex flex-col bg-canvas rounded-t-[28px] sheet-safe ${recorded ? '[&_button]:pointer-events-none' : ''}`}
      panelProps={{ 'aria-busy': recorded ? true : undefined }}
    >
        <div className="px-4 pt-2.5">
          <span aria-hidden="true" className="block w-12 h-[5px] rounded-full bg-line mx-auto mb-3" />
          <div className="flex flex-row items-start gap-3 mb-3">
            {canGoBack ? (
              <button type="button" onClick={() => setDetail(null)} aria-label="חזרה לרשימה" className="w-12 h-12 rounded-full bg-surface border border-line flex items-center justify-center shrink-0">
                <AppIcon name="chevronRight" size={22} color={ds.brand} />
              </button>
            ) : null}
            <div className="flex-1 min-w-0">
              <h2 className="text-[22px] font-extrabold text-ink leading-tight">{detail ? detail.title : focusItems ? 'איזו תפילה התפללת?' : 'מה רשמת?'}</h2>
              <p className="text-[14px] text-ink-muted mt-0.5">
                {detail ? 'עוד פרט אחד, והתפילה נרשמת' : focusItems ? `${focus!.title} · נרשם רק מה שבחרת` : 'בחרו פעולה שכבר עשיתם. היא נרשמת להיום.'}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="סגירה" className="w-12 h-12 rounded-full bg-surface border border-line flex items-center justify-center shrink-0">
              <AppIcon name="close" size={20} color={ds.inkMuted} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-4 pb-2 flex flex-col gap-4">
          {detail ? (
            <div className="flex flex-col gap-2.5">
              {[
                { minyan: true, label: 'במניין', note: 'כולל תוספת למניין' },
                { minyan: false, label: 'ביחידות', note: 'תפילה ללא מניין' },
              ].map((o) => {
                const pts = previewPoints(detail.key, { minyan: o.minyan });
                return (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => record(detail.key, o.minyan)}
                    className="min-h-[68px] rounded-[18px] bg-surface border border-line ds-shadow px-4 flex flex-row items-center gap-3 text-right active:bg-brand-soft"
                  >
                    <span className="flex-1 flex flex-col">
                      <span className="text-[17px] font-extrabold text-ink">
                        {detail.title} {o.label}
                      </span>
                      <span className="text-[13px] text-ink-muted">{o.note}</span>
                    </span>
                    <span className="text-[13px] font-bold text-brand">
                      {isRecorded(detail.key, o.minyan) ? (
                        'נרשם ✓'
                      ) : pts > 0 ? (
                        <>
                          <Num>+{pts}</Num> נק׳
                        </>
                      ) : (
                        'ללא נקודות'
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : focusItems ? (
            <div className="flex flex-col gap-2.5 pb-2">
              {focusItems.map((item) => {
                const isDone = (item.oncePerDay && doneToday.has(item.key)) || isRecorded(item.key);
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={isDone}
                    onClick={() => choose(item)}
                    aria-label={isDone ? `${item.title} – נרשם היום` : item.title}
                    className={`min-h-[60px] rounded-[18px] border px-4 flex flex-row items-center gap-3 text-right ${
                      isDone ? 'bg-lime-soft text-lime-ink border-transparent' : 'bg-surface text-ink border-line ds-shadow active:bg-brand-soft'
                    }`}
                  >
                    <span className="flex-1 text-[17px] font-extrabold">{item.title}</span>
                    {isDone ? <span className="text-[13px] font-bold">נרשם היום ✓</span> : <AppIcon name="chevronLeft" size={18} color={ds.brand} />}
                  </button>
                );
              })}
            </div>
          ) : (
            groups.map((g) => (
              <section key={g.category} aria-label={g.title} className="flex flex-col gap-2">
                <h3 className="text-[13px] font-bold text-ink-muted">{g.title}</h3>
                <div className="grid grid-cols-2 gap-2">
                  {g.items.map((item) => {
                    const def = actionDef(item.key);
                    const isDone = (item.oncePerDay && doneToday.has(item.key)) || isRecorded(item.key);
                    const pts = isDone ? 0 : previewPoints(item.key, {});
                    return (
                      <button
                        key={item.key}
                        type="button"
                        disabled={isDone}
                        onClick={() => choose(item)}
                        aria-label={isDone ? `${item.title} – נרשם היום` : item.title}
                        className={`min-h-[76px] rounded-[18px] border px-3 py-2.5 flex flex-row items-center gap-2.5 text-right ${
                          isDone ? 'bg-lime-soft border-transparent' : 'bg-surface border-line ds-shadow active:bg-brand-soft'
                        }`}
                      >
                        <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDone ? 'bg-lime' : 'bg-brand-soft'}`} aria-hidden="true">
                          <AppIcon name={isDone ? 'check' : def.icon} size={20} color={isDone ? ds.ink : ds.brand} strokeWidth={isDone ? 3 : 2} />
                        </span>
                        <span className="flex-1 min-w-0 flex flex-col">
                          <span className="text-[15px] font-extrabold text-ink leading-tight">{item.title}</span>
                          <span className={`text-[12px] font-bold mt-0.5 ${isDone ? 'text-lime-ink' : 'text-ink-muted'}`}>
                            {isRecorded(item.key) ? (
                              'נרשם ✓'
                            ) : isDone ? (
                              'נרשם היום ✓'
                            ) : item.detail ? (
                              'במניין או ביחידות'
                            ) : pts > 0 ? (
                              <>
                                <Num>+{pts}</Num> נק׳
                              </>
                            ) : (
                              'נרשם, ללא נקודות נוספות'
                            )}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
    </ModalLayer>
  );
}
