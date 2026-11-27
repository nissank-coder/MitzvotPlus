import { useEffect, useRef } from 'react';
import { accountApi } from '../backend/account';
import { supabaseClient } from '../backend/supabase';
import { LEARNING_ACTIONS } from '../backend/together';
import { useAppStore } from '../store/AppStore';

/**
 * "לומדים יחד" (staging builds with VITE_SOCIAL=true): a learning entry – or its undo – is sent soon
 * after it is recorded, so the partner's screen can show it without the user opening the account
 * screen. Only for a signed-in account, in its own data space, with backup AND sharing on; a failure
 * is left to the next sync (the entry stays saved on the device).
 */
export default function TogetherAutoSync() {
  const { state, space, runSync } = useAppStore();
  const learning = state.logs.filter((l) => l.actionKey && (LEARNING_ACTIONS as readonly string[]).includes(l.actionKey)).map((l) => l.id).join(',');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        const api = accountApi(await supabaseClient());
        const u = await api.currentUser();
        if (!u || space !== `user:${u.id}`) return;
        const c = await api.consent().catch(() => null);
        if (!c?.cloudBackup || !c.social) return;
        await runSync(api.remote(), true).catch(() => undefined);
      })();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [learning, space, runSync]);
  return null;
}
