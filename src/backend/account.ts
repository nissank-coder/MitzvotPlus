import type { SupabaseClient } from '@supabase/supabase-js';
import { RemoteEvent, SyncError, SyncErrorCode, SyncRemote } from '../sync/engine';
import type { EventReceipt } from '../sync/outbox';

/**
 * Account operations (round 12). Sign-in: e-mail one-time code (the app's own sign-in, no third-party
 * login – so Apple's "Sign in with Apple" rule 4.8 does not apply, and no deep link is needed).
 * Guest use needs no account at all; signing in later keeps the local history (it is uploaded only
 * after the user turns on backup).
 */
export type AccountUser = { id: string; email: string | null };
export type Consent = { cloudBackup: boolean; social: boolean };

/** Maps a server error to a sync error code (messages come from supabase/migrations). */
export function errorCode(e: unknown): SyncErrorCode {
  const msg = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  if (/consent_required/.test(msg)) return 'consent_required';
  if (/account_deleted/.test(msg)) return 'account_deleted';
  if (/rate_limited/.test(msg)) return 'rate_limited';
  if (/local_save_failed/.test(msg)) return 'local_save_failed';
  if (/not_authenticated|JWT|401/.test(msg)) return 'not_authenticated';
  if (/fetch|network|Failed to fetch|timeout|offline/i.test(msg)) return 'offline';
  return 'unknown';
}

export function accountApi(sb: SupabaseClient) {
  const rpc = async <T,>(fn: string, args: Record<string, unknown> = {}): Promise<T> => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new SyncError(errorCode(error), error.message);
    return data as T;
  };
  return {
    async currentUser(): Promise<AccountUser | null> {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? { id: u.id, email: u.email ?? null } : null;
    },
    async requestCode(email: string): Promise<void> {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error) throw new SyncError(errorCode(error), error.message);
    },
    async verifyCode(email: string, code: string): Promise<AccountUser> {
      const { data, error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
      if (error || !data.user) throw new SyncError(errorCode(error), error?.message ?? 'no user');
      return { id: data.user.id, email: data.user.email ?? null };
    },
    /**
     * Signs out. If the server cannot be reached the tokens are still removed from this device
     * ('local'); the refresh token then expires on the server by itself. Never throws.
     */
    async signOut(): Promise<{ serverRevoked: boolean }> {
      try {
        const { error } = await sb.auth.signOut();
        if (!error) return { serverRevoked: true };
      } catch {
        // fall through to the local sign-out
      }
      await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
      return { serverRevoked: false };
    },
    async consent(): Promise<Consent> {
      const { data, error } = await sb.from('profiles').select('consent_cloud_backup, consent_social').single();
      if (error) throw new SyncError(errorCode(error), error.message);
      return { cloudBackup: Boolean(data.consent_cloud_backup), social: Boolean(data.consent_social) };
    },
    setConsent: (c: Consent, deleteCloudData = false) =>
      rpc('set_consent', { p_cloud_backup: c.cloudBackup, p_social: c.social, p_delete_cloud_data: deleteCloudData }),
    exportServerData: () => rpc<Record<string, unknown>>('export_my_data'),
    async deleteAccount(): Promise<void> {
      await rpc('delete_my_account');
      await sb.auth.signOut().catch(() => undefined);
    },
    remote(): SyncRemote {
      return {
        submit: async (batch) => {
          const rows = await rpc<Array<{ event_id: string; outcome: EventReceipt['outcome']; reason: string | null }>>('submit_events', {
            p_events: batch.map((b) => ({ eventId: b.eventId, operation: b.operation, targetEventId: b.targetEventId, payload: JSON.parse(b.payload) })),
          });
          const at = new Date().toISOString();
          return rows.map((r) => ({ eventId: r.event_id, outcome: r.outcome, reasonCode: r.reason ?? undefined, serverReceivedAtUtc: at }));
        },
        pull: async (after) => (await rpc<RemoteEvent[]>('pull_events', { p_after: after, p_limit: 200 })).map((e) => ({ ...e, seq: Number(e.seq) })),
        setBlessingGoals: async (goals) => {
          await rpc('set_blessing_goals', { p_goals: goals });
        },
      };
    },
  };
}
export type AccountApi = ReturnType<typeof accountApi>;
