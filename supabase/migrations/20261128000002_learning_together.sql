-- "לומדים יחד" – the first private learning challenge between two people (main decision doc §4).
--
-- One definition only: learn-3-of-7 – at least 3 learning DAYS within 7 days. A learning day is a
-- local date with at least one live (not voided) learning entry the user backed up
-- (torahStudy, dailyTorah, learningTrack, mitzvahStudy – the same set as achievements A10/A11).
-- At most one per participant per day; an undo (void) removes the day again. The server computes
-- everything from the backed-up events – never from a number the app sends.
--
-- Privacy: only members see a challenge; another member's progress is shown only while that member
-- has social consent, has not left and nobody blocked anybody. Only the agreed metric is shared (a
-- display name and a count of learning days) – no entry, no time, no other action. Private actions
-- are never uploaded at all (action_privacy), so they cannot count or show.
--
-- Comparison (said before joining): more learning days ranks first; equal days is a tie. The
-- challenge closes one day after its last day (late sync, an entry recorded after Shabbat or a
-- holiday); after that the result is final.
--
-- Every table is reachable only through the functions below (RLS on, no grants).

-- ============================================================ tables
create table public.together_challenges (
  id uuid primary key default gen_random_uuid(),
  definition text not null check (definition in ('learn-3-of-7')),
  tz text not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  start_date date,
  end_date date,
  status text not null default 'pending' check (status in ('pending', 'active', 'cancelled'))
);
create table public.together_members (
  challenge_id uuid not null references public.together_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (challenge_id, user_id)
);
create index together_members_user on public.together_members (user_id);
create table public.together_invites (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  challenge_id uuid not null references public.together_challenges(id) on delete cascade,
  inviter uuid not null references auth.users(id) on delete cascade,
  invitee uuid references auth.users(id) on delete cascade, -- a rematch: only that partner may join
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz
);
create table public.together_cheers (
  id bigserial primary key,
  challenge_id uuid not null references public.together_challenges(id) on delete cascade,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  day date not null,
  request_id uuid not null unique,                           -- a retry of the same tap is the same cheer
  created_at timestamptz not null default now(),
  unique (challenge_id, from_user, to_user, day)             -- one cheer a day from one member to another
);
alter table public.together_challenges enable row level security;
alter table public.together_members enable row level security;
alter table public.together_invites enable row level security;
alter table public.together_cheers enable row level security;
revoke all on public.together_challenges, public.together_members, public.together_invites, public.together_cheers from public, anon, authenticated;

-- ============================================================ helpers
create function private.together_target(def text) returns int language sql immutable as $$
  select case def when 'learn-3-of-7' then 3 end
$$;
create function private.together_days(def text) returns int language sql immutable as $$
  select case def when 'learn-3-of-7' then 7 end
$$;
create function private.together_today(c public.together_challenges) returns date language sql stable as $$
  select (now() at time zone c.tz)::date
$$;
create function private.together_state(c public.together_challenges) returns text language sql stable as $$
  select case
    when c.status = 'cancelled' then 'cancelled'
    when c.start_date is null then 'pending'
    when private.together_today(c) > c.end_date + 1 then 'finished'
    else 'active' end
$$;
-- Live learning days of a user in [d0, d1].
create function private.together_learning_days(u uuid, d0 date, d1 date) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct e.local_date)::int
  from public.activity_events e
  where e.user_id = u and e.operation = 'create'
    and e.action_type in ('torahStudy', 'dailyTorah', 'learningTrack', 'mitzvahStudy')
    and e.local_date between d0 and d1
    and not exists (select 1 from public.activity_events v where v.user_id = u and v.operation = 'void' and v.target_event_id = e.event_id)
$$;
create function private.together_name(u uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif((select display_name from public.social_profiles where user_id = u), ''),
                  nullif((select display_name from public.profiles where user_id = u), ''), 'משתתף')
$$;
create function private.together_new_code() returns text language plpgsql volatile set search_path = public, extensions as $$
declare alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; b bytea := gen_random_bytes(8); s text := ''; i int;
begin
  for i in 0..7 loop s := s || substr(alphabet, (get_byte(b, i) % 32) + 1, 1); end loop;
  return s;
end $$;
-- A valid invitation for user u, or null. One answer for every failure (no oracle).
create function private.together_invite_for(p_code text, u uuid) returns public.together_invites
language plpgsql stable security definer set search_path = public as $$
declare inv public.together_invites; c public.together_challenges;
begin
  select * into inv from public.together_invites where code = upper(trim(coalesce(p_code, '')));
  if not found or inv.used_at is not null or inv.expires_at < now() or inv.inviter = u
     or (inv.invitee is not null and inv.invitee <> u)
     or not private.consent_social(inv.inviter) or private.blocked_between(u, inv.inviter) then return null; end if;
  select * into c from public.together_challenges where id = inv.challenge_id;
  if not found or private.together_state(c) <> 'pending'
     or not exists (select 1 from public.together_members m where m.challenge_id = c.id and m.user_id = inv.inviter and m.left_at is null) then return null; end if;
  return inv;
end $$;
revoke all on function private.together_target(text), private.together_days(text), private.together_today(public.together_challenges),
  private.together_state(public.together_challenges), private.together_learning_days(uuid, date, date), private.together_name(uuid),
  private.together_new_code(), private.together_invite_for(text, uuid) from public, anon, authenticated;

-- ============================================================ invitation
create function public.create_challenge_invite(p_definition text, p_tz text default 'Asia/Jerusalem', p_invitee uuid default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare u uuid := auth.uid(); tz text; cid uuid; c text; inv public.together_invites;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.consent_social(u) then raise exception 'consent_required' using errcode = 'P0403'; end if;
  perform public.hit_rate_limit('together_invite', 20, interval '1 day');
  if private.together_target(p_definition) is null then raise exception 'bad_definition' using errcode = '22023'; end if;
  tz := case when exists (select 1 from pg_timezone_names where name = p_tz) then p_tz else 'Asia/Jerusalem' end;
  if (select count(*) from public.together_members m join public.together_challenges ch on ch.id = m.challenge_id
      where m.user_id = u and m.left_at is null and ch.status = 'pending') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0429';
  end if;
  insert into public.together_challenges (definition, tz, created_by) values (p_definition, tz, u) returning id into cid;
  insert into public.together_members (challenge_id, user_id) values (cid, u);
  loop
    c := private.together_new_code();
    begin
      insert into public.together_invites (code, challenge_id, inviter, invitee)
      values (c, cid, u, case when p_invitee is not null and p_invitee <> u and not private.blocked_between(u, p_invitee) then p_invitee end)
      returning * into inv;
      exit;
    exception when unique_violation then -- another code
    end;
  end loop;
  return jsonb_build_object('code', inv.code, 'challengeId', cid, 'expiresAt', inv.expires_at);
end $$;

create function public.preview_challenge_invite(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); inv public.together_invites; c public.together_challenges;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.hit_rate_limit('together_preview', 30, interval '1 hour');
  inv := private.together_invite_for(p_code, u);
  if inv.code is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into c from public.together_challenges where id = inv.challenge_id;
  return jsonb_build_object('state', 'ok', 'inviter', private.together_name(inv.inviter), 'definition', c.definition,
    'target', private.together_target(c.definition), 'days', private.together_days(c.definition), 'expiresAt', inv.expires_at);
end $$;

-- Joining needs social consent AND an explicit "I agree to these terms" (metric, period, comparison,
-- what is shared). The challenge starts on the day the second participant joins.
create function public.join_challenge_invite(p_code text, p_accept_terms boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); inv public.together_invites; c public.together_challenges; d date;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.consent_social(u) then raise exception 'consent_required' using errcode = 'P0403'; end if;
  perform public.hit_rate_limit('together_join', 20, interval '1 hour');
  if p_accept_terms is not true then return jsonb_build_object('state', 'terms_required'); end if;
  perform 1 from public.together_invites where code = upper(trim(coalesce(p_code, ''))) for update;
  inv := private.together_invite_for(p_code, u);
  if inv.code is null then return jsonb_build_object('state', 'invalid'); end if;
  select * into c from public.together_challenges where id = inv.challenge_id for update;
  d := private.together_today(c);
  insert into public.together_members (challenge_id, user_id) values (c.id, u) on conflict do nothing;
  update public.together_challenges set status = 'active', start_date = d, end_date = d + private.together_days(c.definition) - 1 where id = c.id;
  update public.together_invites set used_by = u, used_at = now() where code = inv.code;
  return jsonb_build_object('state', 'joined', 'challengeId', c.id);
end $$;

-- ============================================================ reading
create function public.my_together() returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  return jsonb_build_object(
    'challenges', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'definition', c.definition, 'state', private.together_state(c), 'startDate', c.start_date, 'endDate', c.end_date,
        'target', private.together_target(c.definition), 'days', private.together_days(c.definition), 'createdByMe', c.created_by = u,
        'invite', (select jsonb_build_object('code', i.code, 'expiresAt', i.expires_at) from public.together_invites i
                   where i.challenge_id = c.id and i.inviter = u and i.used_at is null and i.expires_at > now() limit 1))
        order by c.created_at desc)
      from public.together_challenges c join public.together_members m on m.challenge_id = c.id
      where m.user_id = u and m.left_at is null and c.status <> 'cancelled'), '[]'::jsonb),
    'invitations', coalesce((
      select jsonb_agg(jsonb_build_object('code', i.code, 'inviter', private.together_name(i.inviter), 'expiresAt', i.expires_at))
      from public.together_invites i
      where i.invitee = u and (private.together_invite_for(i.code, u)).code is not null), '[]'::jsonb));
end $$;

create function public.together_progress(p_challenge uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid(); c public.together_challenges; st text; today date; upto date; target int;
  members jsonb; mine int; best_other int; outcome text;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  perform public.hit_rate_limit('together_read', 600, interval '1 hour');
  select * into c from public.together_challenges where id = p_challenge;
  if not found or not exists (select 1 from public.together_members m where m.challenge_id = c.id and m.user_id = u and m.left_at is null) then
    return jsonb_build_object('state', 'unavailable');
  end if;
  st := private.together_state(c);
  today := private.together_today(c);
  target := private.together_target(c.definition);
  upto := least(coalesce(c.end_date, today), today);
  select jsonb_agg(row_to_json(x)::jsonb order by x."isMe" desc, x.name) into members from (
    select m.user_id as "userId", m.user_id = u as "isMe", private.together_name(m.user_id) as name,
      case when m.left_at is not null then 'left'
           when m.user_id <> u and (private.blocked_between(u, m.user_id) or not private.consent_social(m.user_id)) then 'hidden'
           else 'visible' end as visibility,
      case when c.start_date is null or m.left_at is not null
             or (m.user_id <> u and (private.blocked_between(u, m.user_id) or not private.consent_social(m.user_id))) then null
           else private.together_learning_days(m.user_id, c.start_date, upto) end as days,
      (select count(*) from public.together_cheers k where k.challenge_id = c.id and k.to_user = m.user_id)::int as "cheersReceived",
      exists (select 1 from public.together_cheers k where k.challenge_id = c.id and k.from_user = u and k.to_user = m.user_id and k.day = today) as "cheeredToday"
    from public.together_members m where m.challenge_id = c.id) x;
  if st = 'finished' then
    select (e->>'days')::int into mine from jsonb_array_elements(members) e where (e->>'isMe')::boolean;
    select max((e->>'days')::int) into best_other from jsonb_array_elements(members) e where not (e->>'isMe')::boolean and e->>'visibility' = 'visible';
    outcome := case when best_other is null then 'alone' when mine > best_other then 'first' when mine = best_other then 'tie' else 'second' end;
  end if;
  return jsonb_build_object('state', st, 'definition', c.definition, 'target', target, 'days', private.together_days(c.definition),
    'startDate', c.start_date, 'endDate', c.end_date, 'today', today, 'closesOn', c.end_date + 1, 'members', coalesce(members, '[]'::jsonb),
    'result', case when st = 'finished' then jsonb_build_object('outcome', outcome, 'met', coalesce(mine, 0) >= target) end);
end $$;

-- ============================================================ acting
create function public.cheer_together(p_challenge uuid, p_to uuid, p_request uuid) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c public.together_challenges; n int;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if not private.consent_social(u) then raise exception 'consent_required' using errcode = 'P0403'; end if;
  if p_request is null then raise exception 'bad_request' using errcode = '22023'; end if;
  if exists (select 1 from public.together_cheers where request_id = p_request and from_user = u) then return 'duplicate'; end if;
  perform public.hit_rate_limit('together_cheer', 100, interval '1 day');
  select * into c from public.together_challenges where id = p_challenge;
  if not found or private.together_state(c) <> 'active' or p_to is null or p_to = u
     or not exists (select 1 from public.together_members where challenge_id = c.id and user_id = u and left_at is null)
     or not exists (select 1 from public.together_members where challenge_id = c.id and user_id = p_to and left_at is null)
     or private.blocked_between(u, p_to) or not private.consent_social(p_to) then return 'unavailable'; end if;
  insert into public.together_cheers (challenge_id, from_user, to_user, day, request_id)
  values (c.id, u, p_to, private.together_today(c), p_request) on conflict do nothing;
  get diagnostics n = row_count;
  return case when n = 1 then 'ok' else 'already_today' end;
end $$;

create function public.leave_together(p_challenge uuid) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); c public.together_challenges;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into c from public.together_challenges where id = p_challenge for update;
  if not found then return; end if;
  update public.together_members set left_at = now() where challenge_id = c.id and user_id = u and left_at is null;
  delete from public.together_invites where challenge_id = c.id and inviter = u and used_at is null;
  if c.status = 'pending' then update public.together_challenges set status = 'cancelled' where id = c.id; end if;
end $$;

-- Another round with the same partner: a new challenge and an invitation only that partner can use.
create function public.rematch_together(p_challenge uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); partner uuid; c public.together_challenges;
begin
  if u is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into c from public.together_challenges where id = p_challenge;
  if not found or not exists (select 1 from public.together_members where challenge_id = c.id and user_id = u and left_at is null) then
    raise exception 'unavailable' using errcode = 'P0404';
  end if;
  select m.user_id into partner from public.together_members m where m.challenge_id = c.id and m.user_id <> u and m.left_at is null limit 1;
  if partner is null or private.blocked_between(u, partner) then raise exception 'unavailable' using errcode = 'P0404'; end if;
  return public.create_challenge_invite(c.definition, c.tz, partner);
end $$;

-- ============================================================ grants
revoke all on function public.create_challenge_invite(text, text, uuid), public.preview_challenge_invite(text),
  public.join_challenge_invite(text, boolean), public.my_together(), public.together_progress(uuid),
  public.cheer_together(uuid, uuid, uuid), public.leave_together(uuid), public.rematch_together(uuid) from public, anon;
grant execute on function public.create_challenge_invite(text, text, uuid), public.preview_challenge_invite(text),
  public.join_challenge_invite(text, boolean), public.my_together(), public.together_progress(uuid),
  public.cheer_together(uuid, uuid, uuid), public.leave_together(uuid), public.rematch_together(uuid) to authenticated;
