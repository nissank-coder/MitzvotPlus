-- Round 12.5 – security hardening, on top of 20261126000001..3 (never applied to a hosted project yet).
--  1. Privileges from zero: Supabase grants ALL on new tables / functions in "public" to anon and
--     authenticated by default (ALTER DEFAULT PRIVILEGES). Everything is revoked here and only what the
--     app needs is granted again, explicitly, below.
--  2. Helper functions move to schema "private" (not exposed by the API), so nobody can ask "are X
--     and Y friends?" or "did X block me?".
--  3. Strict event validation: an allow-list of fields with types, dates and ids; unknown fields are
--     refused (no raw JSON is stored unchecked).
--  4. One account = one serialized writer: submit / consent / delete lock the profile row, so a
--     revocation or a deletion can never race an upload, and the pull cursor (seq) of one user
--     always grows in commit order (no event can be skipped).
--  5. Server score = client score also when goals change (goal history), with mixed rules versions,
--     bundles, deletions, and in the same order (timestamps; ids compared byte-wise).
--  6. Community: social consent enforced on the server, friendships only by single-use invitations
--     with expiry and rate limits, blocking wins everywhere, only server-verified achievements shared.

-- ============================================================ 1. privileges from zero
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke all on functions from public;

-- ============================================================ 2. private helpers
create function private.blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
create function private.friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  ) and not private.blocked_between(a, b)
$$;
create function private.consent_social(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select consent_social from public.profiles where user_id = u), false)
$$;
-- Visible to friends: social consent AND a social profile marked visible.
create function private.social_visible(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select private.consent_social(u) and coalesce((select visible from public.social_profiles where user_id = u), false)
$$;
create function private.group_member(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = u)
$$;
revoke all on all functions in schema private from public;
grant execute on function private.blocked_between(uuid, uuid), private.friends(uuid, uuid), private.consent_social(uuid),
  private.social_visible(uuid), private.group_member(uuid, uuid) to authenticated;

-- Policies that used the old public helpers are replaced; the helpers are dropped.
drop policy friendships_parties on public.friendships;
drop policy friendships_request on public.friendships;
drop policy friendships_answer on public.friendships;
drop policy friendships_remove on public.friendships;
drop policy social_self on public.social_profiles;
drop policy social_friends on public.social_profiles;
drop policy groups_read on public.groups;
drop policy groups_create on public.groups;
drop policy members_read on public.group_members;
drop policy gchallenges_read on public.group_challenges;
drop policy shared_own on public.shared_achievements;
drop policy shared_friends on public.shared_achievements;
drop policy kudos_give on public.kudos;
drop policy kudos_read on public.kudos;
drop policy blocks_insert on public.blocks;
drop policy invites_create on public.invites;
drop policy reports_create on public.reports;
drop function public.are_friends(uuid, uuid);
drop function public.is_blocked_between(uuid, uuid);
drop function public.is_group_member(uuid, uuid);

-- ============================================================ 3. core tables: additions
alter table public.activity_events add column occurred_at timestamptz;
update public.activity_events set occurred_at = (payload->>'occurredAtUtc')::timestamptz where operation = 'create' and occurred_at is null;
create index activity_events_user_target on public.activity_events (user_id, target_event_id) where operation = 'void';

-- Goal history (the same snapshots as the app's goalHistory): a day is scored with the blessing goal
-- in force on that day, never with today's goal.
create table public.blessing_goal_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  from_date date not null,
  blessing_goal int not null check (blessing_goal between 10 and 300),
  primary key (user_id, from_date)
);
alter table public.blessing_goal_history enable row level security;
create policy goals_read_own on public.blessing_goal_history for select to authenticated using (user_id = auth.uid());

alter table public.invites add column used_at timestamptz;
alter table public.invites alter column code set default encode(gen_random_bytes(12), 'hex');
alter table public.invites add constraint invites_code_format check (code ~ '^[0-9a-f]{24}$') not valid;

-- ============================================================ 4. helpers for validation and scoring
create function private.is_type(p jsonb, k text, t text) returns boolean language sql immutable as $$
  select coalesce(jsonb_typeof(p->k), 'missing') = t
$$;
create function private.utc_time(v jsonb) returns timestamptz language plpgsql stable as $$
declare t timestamptz;
begin
  if coalesce(jsonb_typeof(v), '') <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$' then return null; end if;
  t := (v #>> '{}')::timestamptz;
  if t < timestamptz '2020-01-01' or t > now() + interval '1 day' then return null; end if;
  return t;
exception when others then return null;
end $$;
create function private.local_date(v jsonb) returns date language plpgsql immutable as $$
begin
  if coalesce(jsonb_typeof(v), '') <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return (v #>> '{}')::date;
exception when others then return null;
end $$;

-- Returns NULL when the event is acceptable, otherwise the reason it is refused.
create function private.event_problem(e jsonb) returns text language plpgsql stable set search_path = public as $$
declare
  p jsonb := e->'payload';
  op text := e->>'operation';
  k text;
  allowed text[];
  occurred timestamptz;
  ld date;
  ctx jsonb;
  id_re constant text := '^[A-Za-z0-9._:-]{8,80}$';
begin
  if coalesce(jsonb_typeof(e), '') <> 'object' or coalesce(jsonb_typeof(p), '') <> 'object' then return 'invalid'; end if;
  if op is null or op not in ('create', 'void') or not private.is_type(e, 'eventId', 'string') or (e->>'eventId') !~ id_re then
    return 'invalid';
  end if;
  if octet_length(p::text) > 2048 then return 'too_large'; end if;
  if not private.is_type(p, 'schemaVersion', 'number') or (p->>'schemaVersion') <> '2' then return 'invalid'; end if;
  allowed := case op
    when 'create' then array['eventId', 'installationId', 'schemaVersion', 'operation', 'actionType', 'quantity', 'category', 'refId',
                             'minyan', 'occurredAtUtc', 'recordedAtUtc', 'localDate', 'backfill', 'calendarContext', 'contentId',
                             'contentVersion', 'onTime', 'rulesVersion', 'bundleOf']
    else array['eventId', 'installationId', 'schemaVersion', 'operation', 'targetEventId', 'recordedAtUtc'] end;
  for k in select jsonb_object_keys(p) loop
    if not k = any(allowed) then return 'unexpected_field'; end if;
  end loop;
  if p->>'eventId' is distinct from e->>'eventId' or p->>'operation' is distinct from op then return 'mismatch'; end if;
  if not private.is_type(p, 'installationId', 'string') or (p->>'installationId') !~ '^[A-Za-z0-9._:-]{4,80}$' then return 'invalid_installation'; end if;
  if private.utc_time(p->'recordedAtUtc') is null then return 'invalid_time'; end if;

  if op = 'void' then
    if not private.is_type(p, 'targetEventId', 'string') or (p->>'targetEventId') !~ id_re
       or (p->>'targetEventId') is distinct from (e->>'targetEventId') then return 'invalid_target'; end if;
    -- Deterministic id: two devices deleting the same entry produce the same event (idempotent).
    if (e->>'eventId') <> 'void:' || (p->>'targetEventId') then return 'invalid_id'; end if;
    return null;
  end if;

  if not private.is_type(p, 'actionType', 'string') then return 'invalid'; end if;
  if not exists (select 1 from public.action_privacy a where a.action_type = p->>'actionType' and a.cloud_backup) then return 'private_action'; end if;
  if not private.is_type(p, 'rulesVersion', 'string') or not exists (select 1 from public.scoring_versions v where v.version = p->>'rulesVersion') then
    return 'unknown_rules';
  end if;
  if p ? 'quantity' and (not private.is_type(p, 'quantity', 'number') or (p->>'quantity') <> '1') then return 'invalid_quantity'; end if;
  if p ? 'category' and (not private.is_type(p, 'category', 'string') or (p->>'category') not in ('enjoyment', 'prayer', 'mitzvah', 'other')) then return 'invalid_category'; end if;
  if p ? 'refId' and (not private.is_type(p, 'refId', 'string') or (p->>'refId') !~ '^[A-Za-z0-9._:,-]{1,200}$') then return 'invalid_ref'; end if;
  if (p ? 'minyan' and not private.is_type(p, 'minyan', 'boolean')) or (p ? 'onTime' and not private.is_type(p, 'onTime', 'boolean'))
     or (p ? 'backfill' and not private.is_type(p, 'backfill', 'boolean')) then return 'invalid_flag'; end if;
  occurred := private.utc_time(p->'occurredAtUtc');
  ld := private.local_date(p->'localDate');
  if occurred is null or ld is null then return 'invalid_time'; end if;
  -- The local date is the day in the user's time zone: at most a day from the UTC date; an
  -- after-the-fact entry (Shabbat / Yom Tov) may be up to two weeks earlier.
  if (ld > (occurred at time zone 'UTC')::date + 1
      or ld < (occurred at time zone 'UTC')::date - (case when coalesce((p->>'backfill')::boolean, false) then 14 else 1 end)) then
    return 'invalid_date';
  end if;
  if p ? 'calendarContext' then
    ctx := p->'calendarContext';
    if coalesce(jsonb_typeof(ctx), '') <> 'object' then return 'invalid_context'; end if;
    for k in select jsonb_object_keys(ctx) loop
      if k not in ('policyVersion', 'tzid', 'il') then return 'unexpected_field'; end if;
    end loop;
    if (ctx ? 'policyVersion' and (not private.is_type(ctx, 'policyVersion', 'string') or (ctx->>'policyVersion') !~ '^[A-Za-z0-9._-]{1,40}$'))
       or (ctx ? 'tzid' and (not private.is_type(ctx, 'tzid', 'string') or (ctx->>'tzid') !~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'))
       or (ctx ? 'il' and not private.is_type(ctx, 'il', 'boolean')) then return 'invalid_context'; end if;
  end if;
  if (p ? 'contentId' and (not private.is_type(p, 'contentId', 'string') or (p->>'contentId') !~ '^[A-Za-z0-9._:-]{1,64}$'))
     or (p ? 'contentVersion' and (not private.is_type(p, 'contentVersion', 'string') or (p->>'contentVersion') !~ '^[A-Za-z0-9._:-]{1,64}$')) then
    return 'invalid_content';
  end if;
  if p ? 'bundleOf' and (p->>'actionType' <> 'blessing' or not private.is_type(p, 'bundleOf', 'string') or (p->>'bundleOf') !~ id_re) then
    return 'invalid_bundle';
  end if;
  return null;
end $$;

-- Goal in force on a day: the last snapshot starting on or before it, else the first one (= goalsOn).
create function private.blessing_goal_on(u uuid, d date) returns int language sql stable set search_path = public as $$
  select coalesce(
    (select blessing_goal from public.blessing_goal_history where user_id = u and from_date <= d order by from_date desc limit 1),
    (select blessing_goal from public.blessing_goal_history where user_id = u order by from_date asc limit 1),
    100)
$$;

-- ============================================================ 5. scoring (mirror of scoreLogs, src/lib/metrics.ts)
create or replace function public.recompute_daily_score(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  ev record;
  rule public.scoring_rules;
  key text;
  total int := 0;
  blessing_count int := 0;
  bonus int := 0;
  seen text[] := '{}';
  scored jsonb := '{}';
  pts int;
  vbonus int;
begin
  for ev in
    select e.* from public.activity_events e
    where e.user_id = p_user and e.local_date = p_date and e.operation = 'create'
      and not exists (select 1 from public.activity_events v where v.user_id = p_user and v.operation = 'void' and v.target_event_id = e.event_id)
    -- Same order as the app: time, then id compared code unit by code unit (not by locale).
    order by e.occurred_at, e.event_id collate "C"
  loop
    if ev.action_type = 'blessing' then
      blessing_count := blessing_count + 1;
      select blessing_goal_bonus into vbonus from public.scoring_versions where version = ev.payload->>'rulesVersion';
      bonus := greatest(bonus, coalesce(vbonus, 0));
    end if;
    select * into rule from public.scoring_rules where version = ev.payload->>'rulesVersion' and action_type = ev.action_type;
    if not found then continue; end if;
    if rule.once_per_day then
      key := ev.action_type || '|' || case when rule.ref_scoped then coalesce(ev.payload->>'refId', '') else '' end;
      if key = any(seen) then continue; end if;
      seen := seen || key;
    end if;
    if coalesce((scored->>ev.action_type)::int, 0) >= rule.daily_cap then continue; end if;
    scored := jsonb_set(scored, array[ev.action_type], to_jsonb(coalesce((scored->>ev.action_type)::int, 0) + 1));
    pts := rule.points;
    if coalesce((ev.payload->>'minyan')::boolean, false) then pts := pts + rule.minyan_bonus; end if;
    if coalesce((ev.payload->>'onTime')::boolean, false) then pts := pts + rule.on_time_bonus; end if;
    total := total + pts;
  end loop;
  if blessing_count < private.blessing_goal_on(p_user, p_date) then bonus := 0; end if;
  if blessing_count = 0 and total = 0 then
    delete from public.daily_scores where user_id = p_user and local_date = p_date;
    return;
  end if;
  insert into public.daily_scores (user_id, local_date, points, blessings, computed_at)
  values (p_user, p_date, total + bonus, blessing_count, now())
  on conflict (user_id, local_date) do update set points = excluded.points, blessings = excluded.blessings, computed_at = now();
end $$;

-- ============================================================ 6. sync RPCs
create or replace function public.submit_events(p_events jsonb)
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
  -- Row lock: serializes this account's uploads with each other, with set_consent and with
  -- delete_my_account (consent and existence are re-read after any concurrent change commits).
  select * into prof from public.profiles where user_id = uid for update;
  if not found then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  if not prof.consent_cloud_backup then raise exception 'consent_required' using errcode = 'P0403'; end if;
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

-- Pull: own events after a cursor. Because uploads of one account are serialized (profile row lock),
-- a later-committed event of that account always has a higher seq: the cursor never skips one.
drop function public.pull_events(bigint, int);
create function public.pull_events(p_after bigint, p_limit int default 200)
returns table (seq bigint, event_id text, operation text, target_event_id text, action_type text, local_date date, payload jsonb)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where user_id = auth.uid()) then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  perform public.hit_rate_limit('pull', 3000, interval '1 hour');
  return query
    select a.seq, a.event_id, a.operation, a.target_event_id, a.action_type, a.local_date, a.payload
    from public.activity_events a
    where a.user_id = auth.uid() and a.seq > coalesce(p_after, 0)
    order by a.seq limit least(greatest(coalesce(p_limit, 200), 1), 500);
end $$;

-- The app's first snapshot starts at '0000-00-00' ("since always").
create function private.goal_from(v jsonb) returns date language sql immutable as $$
  select case when coalesce(jsonb_typeof(v), '') = 'string' and (v #>> '{}') = '0000-00-00' then '-infinity'::date
              else private.local_date(v) end
$$;

-- Goal snapshots from the app; replaces the account's history and rescoring its blessing days.
create function public.set_blessing_goals(p_goals jsonb) returns void
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
  if coalesce(jsonb_typeof(p_goals), '') <> 'array' or jsonb_array_length(p_goals) > 400 then raise exception 'bad_batch' using errcode = '22023'; end if;
  perform public.hit_rate_limit('goals', 60, interval '1 hour');
  for g in select * from jsonb_array_elements(p_goals) loop
    if coalesce(jsonb_typeof(g), '') <> 'object' or private.goal_from(g->'from') is null or not private.is_type(g, 'blessingGoal', 'number')
       or (g->>'blessingGoal') !~ '^\d{1,3}$' or (g->>'blessingGoal')::int not between 10 and 300 then
      raise exception 'bad_goal' using errcode = '22023';
    end if;
  end loop;
  delete from public.blessing_goal_history where user_id = uid;
  insert into public.blessing_goal_history (user_id, from_date, blessing_goal)
  select uid, private.goal_from(x->'from'), (x->>'blessingGoal')::int from jsonb_array_elements(p_goals) x
  on conflict (user_id, from_date) do update set blessing_goal = excluded.blessing_goal;
  for d in select distinct local_date from public.activity_events where user_id = uid and action_type = 'blessing' and operation = 'create' loop
    perform public.recompute_daily_score(uid, d);
  end loop;
end $$;

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
  end if;
  -- Withdrawing social consent hides everything social at once and does not come back by itself:
  -- the profile must be made visible again after a new consent.
  if not p_social then
    update public.social_profiles set visible = false where user_id = auth.uid();
  end if;
  return r;
end $$;

create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform 1 from public.profiles where user_id = auth.uid() for update; -- waits for an upload in flight
  delete from auth.users where id = auth.uid();
end $$;

create or replace function public.export_my_data() returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.profiles where user_id = u) then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  perform public.hit_rate_limit('export', 10, interval '1 hour');
  return jsonb_build_object(
    'exportedAt', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = u),
    'blessingGoals', coalesce((select jsonb_agg(to_jsonb(g) order by g.from_date) from public.blessing_goal_history g where g.user_id = u), '[]'),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.seq) from public.activity_events e where e.user_id = u), '[]'),
    'dailyScores', coalesce((select jsonb_agg(to_jsonb(s) order by s.local_date) from public.daily_scores s where s.user_id = u), '[]'),
    'socialProfile', (select to_jsonb(s) from public.social_profiles s where s.user_id = u),
    'friendships', coalesce((select jsonb_agg(to_jsonb(f)) from public.friendships f where u in (f.requester, f.addressee)), '[]'),
    'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where b.blocker = u), '[]'),
    'invites', coalesce((select jsonb_agg(to_jsonb(i)) from public.invites i where i.inviter = u), '[]'),
    'sharedAchievements', coalesce((select jsonb_agg(to_jsonb(s)) from public.shared_achievements s where s.user_id = u), '[]'),
    'kudosGiven', coalesce((select jsonb_agg(to_jsonb(k)) from public.kudos k where k.from_user = u), '[]'),
    'reports', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r where r.reporter = u), '[]')
  );
end $$;

-- ============================================================ 7. community (foundation only; screens in round 13)
create policy social_read_own on public.social_profiles for select to authenticated using (user_id = auth.uid());
create policy social_insert_own on public.social_profiles for insert to authenticated with check (user_id = auth.uid());
create policy social_update_own on public.social_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy social_delete_own on public.social_profiles for delete to authenticated using (user_id = auth.uid());
create policy social_read_friends on public.social_profiles for select to authenticated
  using (private.social_visible(user_id) and private.friends(auth.uid(), user_id));

create policy friendships_read on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee) and not private.blocked_between(requester, addressee));
create policy friendships_remove on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));

create policy groups_read on public.groups for select to authenticated using (owner = auth.uid() or private.group_member(id, auth.uid()));
create policy groups_create on public.groups for insert to authenticated with check (owner = auth.uid() and private.consent_social(auth.uid()));
-- Members see each other, except people blocked in either direction.
create policy members_read on public.group_members for select to authenticated
  using (private.group_member(group_id, auth.uid()) and (user_id = auth.uid() or not private.blocked_between(auth.uid(), user_id)));
create policy gchallenges_read on public.group_challenges for select to authenticated using (private.group_member(group_id, auth.uid()));

create policy shared_read_own on public.shared_achievements for select to authenticated using (user_id = auth.uid());
create policy shared_delete_own on public.shared_achievements for delete to authenticated using (user_id = auth.uid());
-- Feed foundation: a friend's shared achievement, only while that friend's social consent and
-- visibility are on, and never across a block (private.friends checks the block).
create policy shared_read_friends on public.shared_achievements for select to authenticated
  using (private.social_visible(user_id) and private.friends(auth.uid(), user_id));

create policy kudos_read on public.kudos for select to authenticated
  using (from_user = auth.uid() or exists (
    select 1 from public.shared_achievements s
    where s.id = shared_id and s.user_id = auth.uid() and not private.blocked_between(auth.uid(), from_user)));
-- kudos_take_back (delete own) stays.

-- Server-verifiable achievements only (computed from the backed-up events). Everything else –
-- habits, goal days, personal and private achievements – cannot be shared.
create function private.achievement_earned(u uuid, a text) returns boolean language sql stable security definer set search_path = public as $$
  with live as (
    select e.* from public.activity_events e
    where e.user_id = u and e.operation = 'create'
      and not exists (select 1 from public.activity_events v where v.user_id = u and v.operation = 'void' and v.target_event_id = e.event_id)
  )
  select case a
    when 'A07' then exists (select 1 from public.daily_scores where user_id = u and blessings >= 100)
    when 'A08' then coalesce((select sum(blessings) from public.daily_scores where user_id = u), 0) >= 1000
    when 'A10' then (select count(distinct local_date) from live where action_type in ('torahStudy', 'dailyTorah', 'learningTrack', 'mitzvahStudy')) >= 7
    when 'A11' then (select count(distinct local_date) from live where action_type in ('torahStudy', 'dailyTorah', 'learningTrack', 'mitzvahStudy')) >= 30
    else false end
$$;
revoke all on function private.achievement_earned(uuid, text) from public;

create function public.share_achievement(p_achievement_id text) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.consent_social(u) then raise exception 'consent_required' using errcode = 'P0403'; end if;
  perform public.hit_rate_limit('share', 50, interval '1 day');
  if p_achievement_id is null or p_achievement_id not in ('A07', 'A08', 'A10', 'A11') then return 'not_verifiable'; end if;
  if not private.achievement_earned(u, p_achievement_id) then return 'not_earned'; end if;
  insert into public.shared_achievements (user_id, achievement_id) values (u, p_achievement_id) on conflict do nothing;
  return 'shared';
end $$;

create function public.give_kudos(p_shared_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); owner_id uuid;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.consent_social(u) then raise exception 'consent_required' using errcode = 'P0403'; end if;
  perform public.hit_rate_limit('kudos', 300, interval '1 day');
  select user_id into owner_id from public.shared_achievements where id = p_shared_id;
  -- One answer for "does not exist", "not a friend", "blocked" and "not visible": no oracle.
  if owner_id is null or owner_id = u or not private.friends(u, owner_id) or not private.social_visible(owner_id) then return 'unavailable'; end if;
  insert into public.kudos (from_user, shared_id) values (u, p_shared_id) on conflict do nothing;
  return 'ok';
end $$;

create function public.create_invite() returns text
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c text;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.consent_social(u) then raise exception 'consent_required' using errcode = 'P0403'; end if;
  perform public.hit_rate_limit('invite', 20, interval '1 day');
  delete from public.invites where inviter = u and (expires_at < now() or used_at is not null) and created_at < now() - interval '30 days';
  if (select count(*) from public.invites where inviter = u and used_at is null and expires_at > now()) >= 20 then
    raise exception 'rate_limited' using errcode = 'P0429';
  end if;
  insert into public.invites (inviter) values (u) returning code into c;
  return c;
end $$;

-- Redeeming an invitation makes both sides friends (the inviter agreed by inviting, the redeemer by
-- redeeming). Single use, expires after 7 days, rate limited against guessing. Every failure gives
-- the same answer ('invalid'), so codes and relationships cannot be probed.
create function public.redeem_invite(p_code text) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); inv public.invites;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.consent_social(u) then raise exception 'consent_required' using errcode = 'P0403'; end if;
  perform public.hit_rate_limit('redeem', 20, interval '1 hour');
  if p_code is null or p_code !~ '^[0-9a-f]{24}$' then return 'invalid'; end if;
  select * into inv from public.invites where code = p_code for update;
  if not found or inv.used_at is not null or inv.expires_at < now() or inv.inviter = u
     or not private.consent_social(inv.inviter) or private.blocked_between(u, inv.inviter) then
    return 'invalid';
  end if;
  update public.invites set used_by = u, used_at = now() where code = p_code;
  delete from public.friendships where (requester = u and addressee = inv.inviter) or (requester = inv.inviter and addressee = u);
  insert into public.friendships (requester, addressee, status, responded_at) values (inv.inviter, u, 'accepted', now());
  return 'ok';
end $$;

-- Blocking ends the friendship and removes kudos both ways; it wins over every other rule.
create function public.block_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.hit_rate_limit('block', 100, interval '1 day');
  if p_user is null or p_user = u or not exists (select 1 from auth.users where id = p_user) then return; end if;
  insert into public.blocks (blocker, blocked) values (u, p_user) on conflict do nothing;
  delete from public.friendships where (requester = u and addressee = p_user) or (requester = p_user and addressee = u);
  delete from public.kudos k using public.shared_achievements s
  where k.shared_id = s.id and ((k.from_user = u and s.user_id = p_user) or (k.from_user = p_user and s.user_id = u));
end $$;

create function public.submit_report(p_target_kind text, p_target_id text, p_reason text, p_details text default null, p_reported_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.hit_rate_limit('report', 20, interval '1 day');
  insert into public.reports (reporter, reported_user, target_kind, target_id, reason, details)
  values (auth.uid(), case when exists (select 1 from auth.users where id = p_reported_user) then p_reported_user end,
          p_target_kind, left(coalesce(p_target_id, ''), 80), p_reason, p_details);
end $$;

-- ============================================================ 8. grants: exactly what the app needs
-- Functions get EXECUTE for PUBLIC by default (a global default that a per-schema rule cannot remove),
-- so every function created above is revoked again here before the explicit grants.
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
alter default privileges revoke execute on functions from public;
grant execute on function private.blocked_between(uuid, uuid), private.friends(uuid, uuid), private.consent_social(uuid),
  private.social_visible(uuid), private.group_member(uuid, uuid) to authenticated;
grant select on public.scoring_versions, public.scoring_rules, public.action_privacy to authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select on public.activity_events, public.daily_scores, public.blessing_goal_history to authenticated;
grant select, insert, delete on public.social_profiles to authenticated;
grant update (handle, display_name, visible) on public.social_profiles to authenticated;
grant select, delete on public.blocks to authenticated;           -- unblock; blocking via block_user()
grant select, delete on public.friendships to authenticated;      -- unfriend; friendships via redeem_invite()
grant select, delete on public.invites to authenticated;          -- withdraw; creation via create_invite()
grant select, insert, delete on public.groups to authenticated;
grant update (name) on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;    -- leave; joining arrives in round 13
grant select on public.group_challenges to authenticated;
grant select, delete on public.shared_achievements to authenticated; -- sharing via share_achievement()
grant select, delete on public.kudos to authenticated;            -- giving via give_kudos()
grant select on public.reports to authenticated;                  -- own only (RLS); filing via submit_report()

grant execute on function
  public.submit_events(jsonb), public.pull_events(bigint, int), public.set_blessing_goals(jsonb),
  public.set_consent(boolean, boolean, boolean), public.export_my_data(), public.delete_my_account(),
  public.share_achievement(text), public.give_kudos(uuid), public.create_invite(), public.redeem_invite(text),
  public.block_user(uuid), public.submit_report(text, text, text, text, uuid)
to authenticated;
-- anon: nothing at all.
