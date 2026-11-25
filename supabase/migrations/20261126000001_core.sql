-- Round 12 – core schema: private profiles, consent, activity events (sync), server-side scoring.
-- Every table has row-level security. Clients never write events or scores directly: only through
-- the SECURITY DEFINER functions below, which check identity, consent, privacy and rate.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- reference tables
create table public.scoring_versions (
  version text primary key,
  blessing_goal_bonus int not null
);
create table public.scoring_rules (
  version text not null references public.scoring_versions(version),
  action_type text not null,
  points int not null,
  daily_cap int not null,
  once_per_day boolean not null,
  ref_scoped boolean not null,
  minyan_bonus int not null default 0,
  on_time_bonus int not null default 0,
  primary key (version, action_type)
);
-- Which actions may ever be backed up / shown socially. Not listed = local only (default deny).
create table public.action_privacy (
  action_type text primary key,
  cloud_backup boolean not null,
  social boolean not null
);
alter table public.scoring_versions enable row level security;
alter table public.scoring_rules enable row level security;
alter table public.action_privacy enable row level security;
create policy read_versions on public.scoring_versions for select to authenticated using (true);
create policy read_rules on public.scoring_rules for select to authenticated using (true);
create policy read_privacy on public.action_privacy for select to authenticated using (true);
grant select on public.scoring_versions, public.scoring_rules, public.action_privacy to authenticated;

-- ---------------------------------------------------------------- private profile + consent
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 30),
  blessing_goal int not null default 100 check (blessing_goal between 10 and 300),
  consent_cloud_backup boolean not null default false,
  consent_social boolean not null default false,
  consent_updated_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy profile_read_own on public.profiles for select to authenticated using (user_id = auth.uid());
create policy profile_update_own on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, update (display_name, blessing_goal) on public.profiles to authenticated;
-- Consent is changed only through set_consent() (records the time); no direct insert/delete.

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- activity events (append-only)
create table public.activity_events (
  seq bigserial unique,                       -- pull cursor
  event_id text primary key check (char_length(event_id) between 8 and 80),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null check (char_length(installation_id) <= 80),
  schema_version int not null check (schema_version >= 2),
  operation text not null check (operation in ('create', 'void')),
  target_event_id text,
  action_type text,
  local_date date,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index activity_events_user_seq on public.activity_events (user_id, seq);
create index activity_events_user_date on public.activity_events (user_id, local_date);
alter table public.activity_events enable row level security;
create policy events_read_own on public.activity_events for select to authenticated using (user_id = auth.uid());
grant select on public.activity_events to authenticated;
-- No insert/update/delete grant: events enter only through submit_events().

-- ---------------------------------------------------------------- scores (server-computed)
create table public.daily_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  points int not null,
  blessings int not null,
  computed_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
alter table public.daily_scores enable row level security;
create policy scores_read_own on public.daily_scores for select to authenticated using (user_id = auth.uid());
grant select on public.daily_scores to authenticated;

-- ---------------------------------------------------------------- rate limiting
create table public.rate_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  hits int not null,
  primary key (user_id, bucket)
);
alter table public.rate_counters enable row level security; -- no policies: functions only

create function public.hit_rate_limit(p_bucket text, p_max int, p_window interval, p_cost int default 1)
returns void language plpgsql security definer set search_path = public as $$
declare r public.rate_counters;
begin
  select * into r from public.rate_counters where user_id = auth.uid() and bucket = p_bucket for update;
  if not found or r.window_start < now() - p_window then
    insert into public.rate_counters (user_id, bucket, window_start, hits) values (auth.uid(), p_bucket, now(), p_cost)
    on conflict (user_id, bucket) do update set window_start = now(), hits = p_cost;
  elsif r.hits + p_cost > p_max then
    raise exception 'rate_limited' using errcode = 'P0429';
  else
    update public.rate_counters set hits = hits + p_cost where user_id = auth.uid() and bucket = p_bucket;
  end if;
end $$;
revoke all on function public.hit_rate_limit(text, int, interval, int) from public;

-- ---------------------------------------------------------------- scoring (mirror of src/lib/metrics.ts scoreLogs)
create function public.recompute_daily_score(p_user uuid, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare
  ev record;
  rule public.scoring_rules;
  key text;
  total int := 0;
  blessing_count int := 0;
  bonus int := 0;
  goal int;
  seen text[] := '{}';
  scored jsonb := '{}';
  pts int;
begin
  for ev in
    select e.* from public.activity_events e
    where e.user_id = p_user and e.local_date = p_date and e.operation = 'create'
      and not exists (select 1 from public.activity_events v where v.operation = 'void' and v.target_event_id = e.event_id and v.user_id = p_user)
    order by (e.payload->>'occurredAtUtc'), e.event_id
  loop
    select * into rule from public.scoring_rules where version = ev.payload->>'rulesVersion' and action_type = ev.action_type;
    if ev.action_type = 'blessing' then blessing_count := blessing_count + 1; end if;
    if not found then continue; end if; -- unknown rules version or action: 0 points, never guessed
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
  select blessing_goal into goal from public.profiles where user_id = p_user;
  if blessing_count >= coalesce(goal, 100) then
    select coalesce(max(v.blessing_goal_bonus), 0) into bonus
    from public.scoring_versions v
    where v.version in (select distinct e.payload->>'rulesVersion' from public.activity_events e
                        where e.user_id = p_user and e.local_date = p_date and e.action_type = 'blessing');
  end if;
  insert into public.daily_scores (user_id, local_date, points, blessings, computed_at)
  values (p_user, p_date, total + bonus, blessing_count, now())
  on conflict (user_id, local_date) do update set points = excluded.points, blessings = excluded.blessings, computed_at = now();
end $$;
revoke all on function public.recompute_daily_score(uuid, date) from public;

-- ---------------------------------------------------------------- RPC: submit events (push)
-- Returns one receipt per event. Idempotent: the same event_id again → 'duplicate'.
create function public.submit_events(p_events jsonb)
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
  act text;
  tgt public.activity_events;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into prof from public.profiles where user_id = uid;
  if not found then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  if not prof.consent_cloud_backup then raise exception 'consent_required' using errcode = 'P0403'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 100 then raise exception 'bad_batch' using errcode = '22023'; end if;
  perform public.hit_rate_limit('submit', 1000, interval '1 hour', jsonb_array_length(p_events));

  for e in select * from jsonb_array_elements(p_events) loop
    event_id := e->>'eventId';
    op := e->>'operation';
    act := e->'payload'->>'actionType';
    if event_id is null or op not in ('create', 'void') or (e->'payload') is null or octet_length((e->'payload')::text) > 4096
       or coalesce((e->'payload'->>'schemaVersion')::int, 0) < 2 then
      outcome := 'rejected'; reason := 'invalid'; return next; continue;
    end if;
    select * into existing from public.activity_events a where a.event_id = e->>'eventId';
    if found then
      if existing.user_id = uid then outcome := 'duplicate'; reason := null; else outcome := 'rejected'; reason := 'conflict'; end if;
      return next; continue;
    end if;
    if op = 'create' then
      if not exists (select 1 from public.action_privacy p where p.action_type = act and p.cloud_backup) then
        outcome := 'rejected'; reason := 'private_action'; return next; continue;
      end if;
      insert into public.activity_events (event_id, user_id, installation_id, schema_version, operation, action_type, local_date, payload)
      values (e->>'eventId', uid, coalesce(e->'payload'->>'installationId', ''), (e->'payload'->>'schemaVersion')::int, 'create', act,
              (e->'payload'->>'localDate')::date, e->'payload');
      d := (e->'payload'->>'localDate')::date;
    else
      select * into tgt from public.activity_events a where a.event_id = e->>'targetEventId' and a.user_id = uid and a.operation = 'create';
      if not found then outcome := 'rejected'; reason := 'unknown_target'; return next; continue; end if;
      if exists (select 1 from public.activity_events v where v.operation = 'void' and v.target_event_id = tgt.event_id) then
        outcome := 'duplicate'; reason := 'already_voided'; return next; continue; -- deleted on another device too
      end if;
      insert into public.activity_events (event_id, user_id, installation_id, schema_version, operation, target_event_id, action_type, local_date, payload)
      values (e->>'eventId', uid, coalesce(e->'payload'->>'installationId', ''), (e->'payload'->>'schemaVersion')::int, 'void',
              tgt.event_id, tgt.action_type, tgt.local_date, e->'payload');
      d := tgt.local_date;
    end if;
    if d is not null and not d = any(dates) then dates := dates || d; end if;
    outcome := 'accepted'; reason := null; return next;
  end loop;
  foreach d in array dates loop perform public.recompute_daily_score(uid, d); end loop;
end $$;
revoke all on function public.submit_events(jsonb) from public;
grant execute on function public.submit_events(jsonb) to authenticated;

-- ---------------------------------------------------------------- RPC: pull events since a cursor
create function public.pull_events(p_after bigint, p_limit int default 200)
returns setof public.activity_events
language sql stable security invoker set search_path = public as $$
  select * from public.activity_events
  where user_id = auth.uid() and seq > coalesce(p_after, 0)
  order by seq limit least(greatest(p_limit, 1), 500)
$$;
grant execute on function public.pull_events(bigint, int) to authenticated;

-- ---------------------------------------------------------------- RPC: consent, goals, export, delete
create function public.set_consent(p_cloud_backup boolean, p_social boolean, p_delete_cloud_data boolean default false)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare r public.profiles;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  update public.profiles set consent_cloud_backup = p_cloud_backup, consent_social = p_social, consent_updated_at = now()
  where user_id = auth.uid() returning * into r;
  if not found then raise exception 'account_deleted' using errcode = 'P0410'; end if;
  -- Revoking backup may also remove what was already backed up (the user's choice).
  if not p_cloud_backup and p_delete_cloud_data then
    delete from public.activity_events where user_id = auth.uid();
    delete from public.daily_scores where user_id = auth.uid();
  end if;
  return r;
end $$;
revoke all on function public.set_consent(boolean, boolean, boolean) from public;
grant execute on function public.set_consent(boolean, boolean, boolean) to authenticated;

create function public.export_my_data() returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.hit_rate_limit('export', 10, interval '1 hour');
  return jsonb_build_object(
    'exportedAt', now(),
    'profile', (select to_jsonb(p) from public.profiles p where p.user_id = auth.uid()),
    'events', coalesce((select jsonb_agg(to_jsonb(e) order by e.seq) from public.activity_events e where e.user_id = auth.uid()), '[]'),
    'dailyScores', coalesce((select jsonb_agg(to_jsonb(s) order by s.local_date) from public.daily_scores s where s.user_id = auth.uid()), '[]')
  );
end $$;
revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

-- Deletes the auth user; every table cascades. A later request with the old token finds no profile
-- ('account_deleted'), so an offline device can never recreate the account's data.
create function public.delete_my_account() returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
