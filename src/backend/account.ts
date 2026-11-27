import type { SupabaseClient } from '@supabase/supabase-js';
import { BackupState, RemoteEvent, SyncError, SyncErrorCode, SyncRemote } from '../sync/engine';
import type { GoalWire } from '../sync/goals';
import type { OAuthProvider } from './oauth';
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
  if (/backup_epoch_changed/.test(msg)) return 'backup_changed';
  if (/backup_decision_required/.test(msg)) return 'backup_decision_required';
  if (/goals_conflict/.test(msg)) return 'goals_conflict';
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
  const api = {
    async currentUser(): Promise<AccountUser | null> {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? { id: u.id, email: u.email ?? null } : null;
    },
    async requestCode(email: string): Promise<void> {
      const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
      if (error && (error as { status?: number }).status === 429) throw new SyncError('rate_limited', 'code_rate_limited');
      if (error) throw new SyncError(errorCode(error), error.message);
    },
    /**
     * Staging test accounts only ("לומדים יחד"): an e-mail and a password created by the project owner
     * in the dashboard. The screen offers it only when VITE_AUTH_PASSWORD=true (never in production –
     * a production build has no account code at all).
     */
    async signInWithPassword(email: string, password: string): Promise<AccountUser> {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error && (error as { status?: number }).status === 400) throw new SyncError('not_authenticated', 'password_invalid');
      if (error || !data.user) throw new SyncError(errorCode(error), error?.message ?? 'no user');
      return { id: data.user.id, email: data.user.email ?? null };
    },
    async verifyCode(email: string, code: string): Promise<AccountUser> {
      const { data, error } = await sb.auth.verifyOtp({ email, token: code.trim(), type: 'email' });
      // A wrong, used or expired code (the server does not say which): ask for a new one.
      if (error && (error as { status?: number }).status === 403) throw new SyncError('not_authenticated', 'code_invalid_or_expired');
      if (error || !data.user) throw new SyncError(errorCode(error), error?.message ?? 'no user');
      return { id: data.user.id, email: data.user.email ?? null };
    },
    /**
     * Round 13: the provider's sign-in page (Google / Apple), to open in the system browser. The
     * PKCE verifier is kept by supabase-js in the secure store until the code comes back.
     */
    async startOAuth(provider: OAuthProvider, redirectTo: string): Promise<string> {
      const { data, error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true, ...(provider === 'google' ? { queryParams: { prompt: 'select_account' } } : {}) },
      });
      if (error || !data?.url) throw new SyncError(errorCode(error), error?.message ?? 'no_url');
      return data.url;
    },
    /** Round 13: the code from the return link → a session. A code this app did not ask for fails. */
    async finishOAuth(code: string): Promise<AccountUser> {
      const { data, error } = await sb.auth.exchangeCodeForSession(code);
      if (error || !data.user) throw new SyncError('not_authenticated', 'oauth_failed');
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
    /** Round 13 (B1): the backup generation, its floor and whether the user must still choose. */
    async backupState(): Promise<BackupState> {
      return backupStateOf(await rpc<RawBackupState>('backup_state'));
    },
    /**
     * Round 13 (B1): the user's answer after a deletion, for every device of the account: "all"
     * (the live history) or "only from now". The first answer for a generation decides; a late
     * answer from another device returns the decision already in force.
     */
    async setBackupScope(epoch: number, all: boolean): Promise<BackupState> {
      return backupStateOf(await rpc<RawBackupState>('set_backup_scope', { p_epoch: epoch, p_all: all }));
    },
    async deleteAccount(): Promise<void> {
      await rpc('delete_my_account');
      await sb.auth.signOut().catch(() => undefined);
    },
    remote(): SyncRemote {
      return {
        submit: async (batch, epoch) => {
          const rows = await rpc<Array<{ event_id: string; outcome: EventReceipt['outcome']; reason: string | null }>>('submit_events', {
            p_events: batch.map((b) => ({ eventId: b.eventId, operation: b.operation, targetEventId: b.targetEventId, payload: JSON.parse(b.payload) })),
            p_epoch: epoch ?? 1,
          });
          const at = new Date().toISOString();
          return rows.map((r) => ({ eventId: r.event_id, outcome: r.outcome, reasonCode: r.reason ?? undefined, serverReceivedAtUtc: at }));
        },
        pull: async (after) => (await rpc<RemoteEvent[]>('pull_events', { p_after: after, p_limit: 200 })).map((e) => ({ ...e, seq: Number(e.seq) })),
        backupState: () => api.backupState(),
        getBlessingGoals: async () => {
          const r = await rpc<{ version: number; goals: GoalWire[] }>('get_blessing_goals');
          return { version: Number(r.version), goals: (r.goals ?? []).map((g) => ({ from: g.from, blessingGoal: Number(g.blessingGoal), setAt: Number(g.setAt ?? 0) })) };
        },
        setBlessingGoals: async (goals, baseVersion) => Number(await rpc<number>('set_blessing_goals', { p_goals: goals, p_base_version: baseVersion })),
      };
    },
  };
  return api;
}
export type AccountApi = ReturnType<typeof accountApi>;

type RawBackupState = { epoch: number; floor: string | null; decisionPending: boolean };
const backupStateOf = (r: RawBackupState): BackupState => ({
  epoch: Number(r.epoch),
  floor: r.floor ? Date.parse(r.floor) : null,
  decisionPending: Boolean(r.decisionPending),
});
