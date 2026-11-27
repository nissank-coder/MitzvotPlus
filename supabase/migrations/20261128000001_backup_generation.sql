-- Round 13 – completion round, on top of 20261127000001_hardening.sql (never applied to a hosted
-- project by this repository; see docs/mobile-readiness/round-12.5/SUPABASE_SETUP_HE.md).
--
-- B1 (review 26.11.2026): deleting the cloud backup and turning it on again.
--   The decision "all history" / "only from now" lived on one device. Now the account has a backup
--   generation that every device must name when it uploads:
--     backup_epoch            grows by one with each deletion of the cloud copy;
--     backup_decision_pending true after a deletion, until the user chose: nothing is accepted;
--     backup_floor            "only from now": a create recorded before it is refused.
--   A device that still holds an old queue (offline during the deletion) is refused with
--   backup_epoch_changed, asks for the state, rebuilds its queue and only then uploads.
--
-- B2: blessing-goal history between devices.
--   set_blessing_goals replaced the whole history with whatever a device sent, so a phone with an
--   old history silently undid a change made on another phone. Now the history has a version; a
--   write names the version it is based on and is refused with goals_conflict if another device
--   wrote meanwhile. Each start day keeps the time its goal was set (merge rule: the later wins).

-- ============================================================ 1. columns
alter table public.profiles
  add column backup_epoch int not null default 1 check (backup_epoch >= 1),
  add column backup_floor timestamptz,
  add column backup_decision_pending boolean not null default false,
  add column goals_version int not null default 0 check (goals_version >= 0);
alter table public.blessing_goal_history add column set_at timestamptz;

-- ============================================================ 2. backup generation
create function private.backup_state_of(u uuid) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'epoch', p.backup_epoch,
    'floor', case when p.backup_floor is null then null else to_char(p.backup_floor at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
    'decisionPending', p.backup_decision_pending)
  from public.profiles p where p.user_id = u
$$;
revoke all on function private.backup_state_of(uuid) from public;

create function public.backup_state() returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  r := private.backup_state_of(auth.uid());
  if r is null then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  return r;
end $$;

-- The user's answer after a deletion. The first answer for a generation decides; an answer for an
-- older generation is refused; a late answer from another device returns the decision in force.
create function public.set_backup_scope(p_epoch int, p_all boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prof public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where user_id = auth.uid() for update;
  if not found then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  if p_epoch is null or p_all is null then raise exception 'bad_request' using errcode = '22023'; end if;
  if p_epoch <> prof.backup_epoch then raise exception 'backup_epoch_changed' using errcode = 'P0409'; end if;
  if prof.backup_decision_pending then
    update public.profiles
       set backup_floor = case when p_all then null else now() end, backup_decision_pending = false
     where user_id = auth.uid();
  end if;
  return private.backup_state_of(auth.uid());
end $$;

-- Deleting the cloud copy starts a new generation and waits for the user's choice.
create or replace function public.set_consent(p_cloud_backup boolean, p_social boolean, p_delete_cloud_data boolean default false)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform 1 from public.profiles where user_id = auth.uid() for update;
  update public.profiles set consent_cloud_backup = p_cloud_backup, consent_social = p_social, consent_updated_at = now()
  where user_id = auth.uid() returning * into r;
  if not found then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  if not p_cloud_backup and p_delete_cloud_data then
    delete from public.activity_events where user_id = auth.uid();
    delete from public.daily_scores where user_id = auth.uid();
    delete from public.blessing_goal_history where user_id = auth.uid();
    update public.profiles
       set backup_epoch = backup_epoch + 1, backup_decision_pending = true, backup_floor = null, goals_version = goals_version + 1
     where user_id = auth.uid() returning * into r;
  end if;
  -- Withdrawing social consent hides everything social at once and does not come back by itself.
  if not p_social then
    update public.social_profiles set visible = false where user_id = auth.uid();
  end if;
  return r;
end $$;

-- ============================================================ 3. uploads name their generation
-- p_epoch NULL = generation 1 (a client from before round 13): refused once the copy was deleted.
drop function public.submit_events(jsonb);
create function public.submit_events(p_events jsonb, p_epoch int default null)
returns table (event_id text, outcome text, reason text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  uid uuid := auth.uid();
  prof public.profiles;
  e jsonb;
  existing public.activity_events;
  dates date[] := '{}';
  d date;
  op text;
  problem text;
  tgt public.activity_events;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  -- Row lock: serializes this account's uploads with each other, with set_consent, set_backup_scope
  -- and delete_my_account.
  select * into prof from public.profiles where user_id = uid for update;
  if not found then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  if not prof.consent_cloud_backup then raise exception 'consent_required' using errcode = 'P0403'; end if;
  if prof.backup_decision_pending then raise exception 'backup_decision_required' using errcode = 'P0428'; end if;
  if coalesce(p_epoch, 1) <> prof.backup_epoch then raise exception 'backup_epoch_changed' using errcode = 'P0409'; end if;
  if coalesce(jsonb_typeof(p_events), '') <> 'array' or jsonb_array_length(p_events) > 100 then raise exception 'bad_batch' using errcode = '22023'; end if;
  perform public.hit_rate_limit('submit', 1000, interval '1 hour', greatest(jsonb_array_length(p_events), 1));

  for e in select * from jsonb_array_elements(p_events) loop
    event_id := case when coalesce(jsonb_typeof(e->'eventId'), '') = 'string' then left(e->>'eventId', 80) end;
    op := e->>'operation';
    if event_id is null or event_id !~ '^[A-Za-z0-9._:-]{8,80}$' then
      outcome := 'rejected'; reason := 'invalid'; return next; continue;
    end if;
    select * into existing from public.activity_events a where a.event_id = e->>'eventId';
    if found then
      if existing.user_id = uid then outcome := 'duplicate'; reason := null; else outcome := 'rejected'; reason := 'conflict'; end if;
      return next; continue;
    end if;
    problem := private.event_problem(e);
    if problem is not null then outcome := 'rejected'; reason := problem; return next; continue; end if;
    -- "Only from now": an entry recorded before the user's choice stays on the device.
    if op = 'create' and prof.backup_floor is not null and private.utc_time(e->'payload'->'recordedAtUtc') < prof.backup_floor then
      outcome := 'rejected'; reason := 'before_backup_floor'; return next; continue;
    end if;

    if op = 'create' then
      insert into public.activity_events (event_id, user_id, installation_id, schema_version, operation, action_type, local_date, occurred_at, payload)
      values (e->>'eventId', uid, e->'payload'->>'installationId', 2, 'create', e->'payload'->>'actionType',
              (e->'payload'->>'localDate')::date, (e->'payload'->>'occurredAtUtc')::timestamptz, e->'payload');
      d := (e->'payload'->>'localDate')::date;
    else
      select * into tgt from public.activity_events a where a.event_id = e->>'targetEventId' and a.user_id = uid and a.operation = 'create';
      if not found then outcome := 'rejected'; reason := 'unknown_target'; return next; continue; end if;
      insert into public.activity_events (event_id, user_id, installation_id, schema_version, operation, target_event_id, action_type, local_date, payload)
      values (e->>'eventId', uid, e->'payload'->>'installationId', 2, 'void', tgt.event_id, tgt.action_type, tgt.local_date, e->'payload');
      d := tgt.local_date;
    end if;
    if not d = any(dates) then dates := dates || d; end if;
    outcome := 'accepted'; reason := null; return next;
  end loop;
  foreach d in array dates loop perform public.recompute_daily_score(uid, d); end loop;
end $$;

-- ============================================================ 4. goal history with a version
create function public.get_blessing_goals() returns jsonb language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select goals_version into v from public.profiles where user_id = auth.uid();
  if not found then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  return jsonb_build_object(
    'version', v,
    'goals', coalesce((
      select jsonb_agg(jsonb_build_object(
               'from', case when g.from_date = '-infinity'::date then '0000-00-00' else to_char(g.from_date, 'YYYY-MM-DD') end,
               'blessingGoal', g.blessing_goal,
               'setAt', coalesce(floor(extract(epoch from g.set_at) * 1000)::bigint, 0))
             order by g.from_date)
      from public.blessing_goal_history g where g.user_id = auth.uid()), '[]'::jsonb));
end $$;

-- Writes the history on top of p_base_version (what the device last read). Another device wrote
-- meanwhile → goals_conflict: the device reads, merges and writes again. Returns the new version.
drop function public.set_blessing_goals(jsonb);
create function public.set_blessing_goals(p_goals jsonb, p_base_version int) returns int
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  g jsonb;
  d date;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where user_id = uid for update;
  if not found then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  if not prof.consent_cloud_backup then raise exception 'consent_required' using errcode = 'P0403'; end if;
  if p_base_version is null or p_base_version <> prof.goals_version then raise exception 'goals_conflict' using errcode = 'P0409'; end if;
  if coalesce(jsonb_typeof(p_goals), '') <> 'array' or jsonb_array_length(p_goals) > 400 then raise exception 'bad_batch' using errcode = '22023'; end if;
  perform public.hit_rate_limit('goals', 60, interval '1 hour');
  for g in select * from jsonb_array_elements(p_goals) loop
    if coalesce(jsonb_typeof(g), '') <> 'object' or private.goal_from(g->'from') is null or not private.is_type(g, 'blessingGoal', 'number')
       or (g->>'blessingGoal') !~ '^\d{1,3}$' or (g->>'blessingGoal')::int not between 10 and 300
       or (g ? 'setAt' and (not private.is_type(g, 'setAt', 'number') or (g->>'setAt') !~ '^\d{1,15}$')) then
      raise exception 'bad_goal' using errcode = '22023';
    end if;
  end loop;
  delete from public.blessing_goal_history where user_id = uid;
  insert into public.blessing_goal_history (user_id, from_date, blessing_goal, set_at)
  select uid, private.goal_from(x->'from'), (x->>'blessingGoal')::int,
         case when coalesce((x->>'setAt')::bigint, 0) > 0 then to_timestamp((x->>'setAt')::bigint / 1000.0) end
  from jsonb_array_elements(p_goals) x
  on conflict (user_id, from_date) do update set blessing_goal = excluded.blessing_goal, set_at = excluded.set_at;
  update public.profiles set goals_version = goals_version + 1 where user_id = uid returning goals_version into prof.goals_version;
  for d in select distinct local_date from public.activity_events where user_id = uid and action_type = 'blessing' and operation = 'create' loop
    perform public.recompute_daily_score(uid, d);
  end loop;
  return prof.goals_version;
end $$;

-- ============================================================ 5. grants: exactly what the app needs
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.blocked_between(uuid, uuid), private.friends(uuid, uuid), private.consent_social(uuid),
  private.social_visible(uuid), private.group_member(uuid, uuid) to authenticated;
grant execute on function
  public.submit_events(jsonb, int), public.pull_events(bigint, int), public.set_blessing_goals(jsonb, int),
  public.get_blessing_goals(), public.backup_state(), public.set_backup_scope(int, boolean),
  public.set_consent(boolean, boolean, boolean), public.export_my_data(), public.delete_my_account(),
  public.share_achievement(text), public.give_kudos(uuid), public.create_invite(), public.redeem_invite(text),
  public.block_user(uuid), public.submit_report(text, text, text, text, uuid)
to authenticated;
-- The new columns are readable with the profile (select on profiles), never writable directly:
-- the column grant of the hardening migration (display_name only) is unchanged.
-- anon: nothing at all.
