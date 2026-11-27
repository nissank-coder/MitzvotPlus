import React, { createContext, useCallback, useContext } from 'react';
import { ActionKey, actionDef } from '../data/actions';
import { useAppStore } from '../store/AppStore';

/**
 * One recording flow for every entry point (round 13, review U5). A prayer that can be said in a
 * minyan is always recorded through the same choice – "במניין" or "ביחידות" – whether it starts on
 * Home ("הצעד הבא", a habit row, "איזו תפילה?"), in the Siddur, on the prayer-times screen or in the
 * day's checklist. Nothing is recorded without that choice, and nothing is chosen for the user.
 */
export type RecordFocus = {
  /** Heading of the narrowed sheet, e.g. "שלוש תפילות". */
  title: string;
  /** The actions to choose from; one action with a minyan choice opens that choice directly. */
  actions: ActionKey[];
};

type Flow = { openQuickAdd: (focus?: RecordFocus) => void };
const RecordFlowContext = createContext<Flow>({ openQuickAdd: () => undefined });

export function RecordFlowProvider({ openQuickAdd, children }: Flow & { children: React.ReactNode }) {
  return <RecordFlowContext.Provider value={{ openQuickAdd }}>{children}</RecordFlowContext.Provider>;
}

export const needsMinyanChoice = (key: ActionKey) => Boolean(actionDef(key).minyanBonus);

/**
 * record(key): an action with a minyan choice opens the shared choice; any other action is recorded
 * at once. choose(title, actions): "which one?" first, then the same choice where it applies.
 */
export function useRecordFlow() {
  const { addAction, addBlessing } = useAppStore();
  const { openQuickAdd } = useContext(RecordFlowContext);
  const record = useCallback(
    (key: ActionKey, extra?: { title?: string; refId?: string }) => {
      if (needsMinyanChoice(key)) openQuickAdd({ title: actionDef(key).title, actions: [key] });
      else if (key === 'blessing') addBlessing('other');
      else addAction(key, extra);
    },
    [addAction, addBlessing, openQuickAdd],
  );
  const choose = useCallback((title: string, actions: ActionKey[]) => openQuickAdd({ title, actions }), [openQuickAdd]);
  return { record, choose, openQuickAdd };
}
