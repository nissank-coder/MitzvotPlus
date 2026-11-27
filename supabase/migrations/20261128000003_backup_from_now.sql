-- "לומדים יחד", part 2.
-- ============================================================ backup "only from now" when turning it on
-- Joining a challenge needs the learning entries on the server. Turning backup on must not upload
-- the earlier history unless the user chose it: this sets the floor of the current generation to now
-- – only while nothing of this account is on the server yet and no choice is open. Every device of
-- the account then rebuilds its queue from the floor (the existing backup-generation mechanism).
create function public.backup_from_now() returns jsonb
language plpgsql security definer set search_path = public as $$
declare prof public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where user_id = auth.uid() for update;
  if not found then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  if prof.backup_floor is null and not prof.backup_decision_pending
     and not exists (select 1 from public.activity_events where user_id = auth.uid()) then
    update public.profiles set backup_floor = now() where user_id = auth.uid();
  end if;
  return private.backup_state_of(auth.uid());
end $$;

revoke all on function public.backup_from_now() from public, anon;
grant execute on function public.backup_from_now() to authenticated;
