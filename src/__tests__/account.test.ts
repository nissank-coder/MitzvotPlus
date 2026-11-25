import { describe, expect, it } from 'vitest';
import { errorCode } from '../backend/account';
import { BACKEND_ENABLED } from '../backend/config';
import { exportLocalJson } from '../lib/exportData';
import { createFreshState, reducer } from '../store/state';

describe('round 12 account helpers', () => {
  it('server errors map to clear sync states', () => {
    expect(errorCode(new Error('consent_required'))).toBe('consent_required');
    expect(errorCode({ message: 'account_deleted' })).toBe('account_deleted');
    expect(errorCode(new Error('rate_limited'))).toBe('rate_limited');
    expect(errorCode(new Error('JWT expired'))).toBe('not_authenticated');
    expect(errorCode(new TypeError('Failed to fetch'))).toBe('offline');
  });
  it('the backend is off in tests and production builds (no variables)', () => {
    expect(BACKEND_ENABLED).toBe(false);
  });
  it('"export my data" contains everything stored locally, private parts included (the user\'s own copy)', () => {
    let s = reducer(createFreshState(0), { type: 'addAction', payload: { key: 'speechPractice', now: 1 } });
    s = reducer(s, { type: 'setReflection', payload: { dateKey: '1970-01-01', text: 'פרטי' } });
    const json = JSON.parse(exportLocalJson(s, 0));
    expect(json.app).toBe('mitzvot-plus');
    expect(json.data.logs[0].actionKey).toBe('speechPractice');
    expect(json.data.reflections['1970-01-01']).toBe('פרטי');
  });
});
