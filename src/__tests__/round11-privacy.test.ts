import { describe, expect, it } from 'vitest';
import * as outbox from '../sync/outbox';
import { calendarContextOf } from '../lib/jewishCalendar';
import { cityById } from '../data/locations';
import { createFreshState, reducer } from '../store/state';

/** Round 11 §3 – privacy policy. Failing tests on main cdf6b89: evidence/round-11/privacy-before.txt */
const NOW = Date.UTC(2026, 10, 24, 10);
type Key = Extract<Parameters<typeof reducer>[1], { type: 'addAction' }>['payload']['key'];
const log = (key: Key, extra: Record<string, unknown> = {}) =>
  reducer(createFreshState(NOW), { type: 'addAction', payload: { key, now: NOW, context: calendarContextOf(cityById('jerusalem')), ...extra } }).logs[0]!;
const api = outbox as unknown as Record<string, (...a: unknown[]) => unknown>;

describe('§3 action classification', () => {
  it('matanot la-evyonim gets the same policy as charity (local only)', () => {
    expect(outbox.syncPolicy({ actionKey: 'matanotLaevyonim' } as never)).toBe('local-only');
    expect(outbox.syncPolicy({ actionKey: 'charity' } as never)).toBe('local-only');
  });
  it('a personal habit (free text the user chose) stays local', () => {
    expect(outbox.syncPolicy({ actionKey: 'personalHabit' } as never)).toBe('local-only');
  });
  it('cloud backup and social sharing are separate decisions', () => {
    expect(api.privacyFor?.('shacharit')).toEqual({ cloudBackup: true, social: true });
    expect(api.privacyFor?.('fastDay')).toEqual({ cloudBackup: true, social: false }); // health-related: never social
    expect(api.privacyFor?.('speechPractice')).toEqual({ cloudBackup: false, social: false });
  });
});

describe('§3 minimal context in events', () => {
  it('a new event carries no city and no candle-lighting minutes (time zone and Israel/diaspora only)', () => {
    const p = JSON.parse(outbox.createEventPayload(log('shacharit'), 'inst')) as Record<string, unknown>;
    expect(p.schemaVersion).toBe(2);
    expect(p.calendarContext).toEqual({ policyVersion: expect.any(String), tzid: 'Asia/Jerusalem', il: true });
  });
  it('facts needed to rebuild the score travel with the event (on time, rules version, bundle source)', () => {
    const p = JSON.parse(outbox.createEventPayload(log('shacharit', { onTime: true }), 'inst')) as Record<string, unknown>;
    expect(p).toMatchObject({ onTime: true, rulesVersion: 'score-3' });
  });
});

describe('§3 the send point is protected, not only the queue entry', () => {
  const item = (actionType: string) => ({
    eventId: actionType, operation: 'create' as const, payload: outbox.canonicalJson({ actionType }),
    status: 'pending' as const, attempts: 0, nextAttemptAt: 0, updatedAt: 0,
  });
  const transport = () => {
    const sent: string[] = [];
    return { sent, t: { submit: async (b: Array<{ eventId: string }>) => (b.forEach((x) => sent.push(x.eventId)), []) } };
  };
  it('nothing is sent while sync is disabled or without active consent', async () => {
    const { sent, t } = transport();
    await (outbox.syncOnce as (...a: unknown[]) => Promise<unknown>)([item('shacharit')], t, NOW, { enabled: false, consent: { cloudBackup: true } });
    await (outbox.syncOnce as (...a: unknown[]) => Promise<unknown>)([item('shacharit')], t, NOW, { enabled: true, consent: { cloudBackup: false } });
    expect(sent).toEqual([]);
  });
  it('a local-only event that somehow sits in the queue is never sent', async () => {
    const { sent, t } = transport();
    await (outbox.syncOnce as (...a: unknown[]) => Promise<unknown>)([item('speechPractice'), item('shacharit')], t, NOW, { enabled: true, consent: { cloudBackup: true } });
    expect(sent).toEqual(['shacharit']);
  });
});
