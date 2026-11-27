-- TEST ONLY: deliberate regressions of round 13. `DB_FAULT=supabase/tests/fault-injection-r13.sql npm run test:db` must FAIL.
-- 1. the backup generation can be changed directly (a leaked column privilege);
-- 2. the choice after a deletion is ignored: any answer, for any generation, is accepted and nothing waits;
-- 3. the goal history loses its version (a stale phone could overwrite it again).
grant update (backup_floor, backup_epoch, backup_decision_pending) on public.profiles to authenticated;
create or replace function public.set_backup_scope(p_epoch int, p_all boolean) returns jsonb
language sql security definer set search_path = public as $$
  update public.profiles set backup_decision_pending = false, backup_floor = null where user_id = auth.uid();
  select private.backup_state_of(auth.uid());
$$;
create or replace function public.get_blessing_goals() returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('version', 0, 'goals', '[]'::jsonb)
$$;
