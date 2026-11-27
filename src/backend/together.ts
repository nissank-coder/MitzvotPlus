import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActivityLog } from '../types';
import { errorCode } from './account';
import { SyncError } from '../sync/engine';

/**
 * "לומדים יחד" – the first private learning challenge between two people (main decision doc §4).
 * Thin, typed calls to the server functions in supabase/migrations/20261128000002_learning_together.sql.
 * The server computes every number from the backed-up events; the app never sends a count.
 */
export const DEFINITION = 'learn-3-of-7' as const;
export type Definition = typeof DEFINITION;
/** Learning actions that make a learning day (same set as the server and achievements A10/A11). */
export const LEARNING_ACTIONS = ['torahStudy', 'dailyTorah', 'learningTrack', 'mitzvahStudy'] as const;

export type Invite = { code: string; challengeId: string; expiresAt: string };
export type Preview =
  | { state: 'ok'; inviter: string; definition: Definition; target: number; days: number; expiresAt: string }
  | { state: 'invalid' };
export type JoinResult = { state: 'joined'; challengeId: string } | { state: 'invalid' } | { state: 'terms_required' };
export type ChallengeState = 'pending' | 'active' | 'finished' | 'cancelled';
export type MyChallenge = {
  id: string;
  definition: Definition;
  state: ChallengeState;
  startDate: string | null;
  endDate: string | null;
  target: number;
  days: number;
  createdByMe: boolean;
  invite: { code: string; expiresAt: string } | null;
};
export type Mine = { challenges: MyChallenge[]; invitations: Array<{ code: string; inviter: string; expiresAt: string }> };
export type Member = {
  userId: string;
  isMe: boolean;
  name: string;
  visibility: 'visible' | 'hidden' | 'left';
  days: number | null;
  cheersReceived: number;
  cheeredToday: boolean;
};
export type Progress =
  | { state: 'unavailable' }
  | {
      state: ChallengeState;
      definition: Definition;
      target: number;
      days: number;
      startDate: string | null;
      endDate: string | null;
      today: string;
      closesOn: string | null;
      members: Member[];
      result: { outcome: 'first' | 'tie' | 'second' | 'alone'; met: boolean } | null;
    };
export type CheerResult = 'ok' | 'duplicate' | 'already_today' | 'unavailable';

/** A code as typed or pasted: letters and digits only, upper case (the server does the same). */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
export const isCodeShape = (code: string) => /^[A-HJ-NP-Z2-9]{8}$/.test(code);

/**
 * This device's own learning days in the challenge window, from the local entries – shown next to the
 * server's confirmed number, so "saved here, not yet counted" is visible instead of a silent gap.
 */
export function localLearningDays(logs: Pick<ActivityLog, 'actionKey' | 'dateKey'>[], startDate: string | null, endDate: string | null, today: string): number {
  if (!startDate) return 0;
  const last = endDate && endDate < today ? endDate : today;
  const days = new Set<string>();
  for (const l of logs) if (l.actionKey && (LEARNING_ACTIONS as readonly string[]).includes(l.actionKey) && l.dateKey >= startDate && l.dateKey <= last) days.add(l.dateKey);
  return days.size;
}

export function togetherApi(sb: SupabaseClient) {
  const rpc = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new SyncError(errorCode(error), error.message);
    return data as T;
  };
  return {
    createInvite: (tz: string) => rpc<Invite>('create_challenge_invite', { p_definition: DEFINITION, p_tz: tz }),
    preview: (code: string) => rpc<Preview>('preview_challenge_invite', { p_code: normalizeCode(code) }),
    join: (code: string, acceptTerms: boolean) => rpc<JoinResult>('join_challenge_invite', { p_code: normalizeCode(code), p_accept_terms: acceptTerms }),
    mine: () => rpc<Mine>('my_together'),
    progress: (challengeId: string) => rpc<Progress>('together_progress', { p_challenge: challengeId }),
    /** A retry must reuse the same requestId: the server counts one cheer per request. */
    cheer: (challengeId: string, to: string, requestId: string) => rpc<CheerResult>('cheer_together', { p_challenge: challengeId, p_to: to, p_request: requestId }),
    leave: (challengeId: string) => rpc<void>('leave_together', { p_challenge: challengeId }),
    rematch: (challengeId: string) => rpc<Invite>('rematch_together', { p_challenge: challengeId }),
    block: (userId: string) => rpc<void>('block_user', { p_user: userId }),
    /** Backup "only from now" when it is turned on for the challenge (no earlier history uploaded). */
    backupFromNow: () => rpc<unknown>('backup_from_now'),
    async displayName(): Promise<string> {
      const { data } = await sb.from('profiles').select('display_name').maybeSingle();
      return (data as { display_name?: string } | null)?.display_name ?? '';
    },
    async setDisplayName(name: string): Promise<void> {
      const { data: u } = await sb.auth.getUser();
      if (!u.user) throw new SyncError('not_authenticated', 'not_authenticated');
      const { error } = await sb.from('profiles').update({ display_name: name.trim().slice(0, 30) }).eq('user_id', u.user.id);
      if (error) throw new SyncError(errorCode(error), error.message);
    },
  };
}
export type TogetherApi = ReturnType<typeof togetherApi>;
