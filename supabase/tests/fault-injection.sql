-- TEST ONLY: deliberate regressions. `DB_FAULT=supabase/tests/fault-injection.sql npm run test:db` must FAIL.
-- 1. a leaked privilege; 2. validation switched off; 3. scoring with today's goal; 4. a public helper.
grant insert on public.activity_events to authenticated;
create policy fault_insert on public.activity_events for insert to authenticated with check (true);
create or replace function private.event_problem(e jsonb) returns text language sql as $$ select case when e->'payload'->>'actionType' in (select action_type from public.action_privacy where not cloud_backup) then 'private_action' end $$;
create or replace function private.blessing_goal_on(u uuid, d date) returns int language sql as $$ select 50 $$;
create function public.are_friends(a uuid, b uuid) returns boolean language sql as $$ select private.friends(a, b) $$;
grant execute on function public.are_friends(uuid, uuid) to authenticated;
