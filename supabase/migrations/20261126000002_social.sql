-- Round 12 – social layer FOUNDATION only (no social network is built yet).
-- Private by default: nothing here is visible to anyone until the user opts in.
-- Blocking always wins over friendship and group membership.

-- ---------------------------------------------------------------- social profile (separate from the private one)
create table public.social_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  handle text unique check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null default '' check (char_length(display_name) <= 30),
  visible boolean not null default false,       -- private by default
  created_at timestamptz not null default now()
);
alter table public.social_profiles enable row level security;

create table public.blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  blocked uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.blocks enable row level security;
create policy blocks_own on public.blocks for select to authenticated using (blocker = auth.uid());
create policy blocks_insert on public.blocks for insert to authenticated with check (blocker = auth.uid());
create policy blocks_delete on public.blocks for delete to authenticated using (blocker = auth.uid());
grant select, insert, delete on public.blocks to authenticated;

create function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;
revoke all on function public.is_blocked_between(uuid, uuid) from public;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- friendships (invitation + mutual acceptance)
create table public.friendships (
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;
create policy friendships_parties on public.friendships for select to authenticated
  using (auth.uid() in (requester, addressee) and not public.is_blocked_between(requester, addressee));
create policy friendships_request on public.friendships for insert to authenticated
  with check (requester = auth.uid() and status = 'pending' and not public.is_blocked_between(requester, addressee));
create policy friendships_answer on public.friendships for update to authenticated
  using (addressee = auth.uid()) with check (addressee = auth.uid() and status in ('accepted', 'declined'));
create policy friendships_remove on public.friendships for delete to authenticated using (auth.uid() in (requester, addressee));
grant select, insert, delete on public.friendships to authenticated;
grant update (status, responded_at) on public.friendships to authenticated;

create function public.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  ) and not public.is_blocked_between(a, b)
$$;
revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

-- Social profiles: yourself always; others only if visible AND (friend) AND not blocked.
create policy social_self on public.social_profiles for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy social_friends on public.social_profiles for select to authenticated
  using (visible and public.are_friends(auth.uid(), user_id));
grant select, insert, update, delete on public.social_profiles to authenticated;

-- Invitations by code (no open search by name).
create table public.invites (
  code text primary key default encode(gen_random_bytes(9), 'base64'),
  inviter uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users(id) on delete set null
);
alter table public.invites enable row level security;
create policy invites_own on public.invites for select to authenticated using (inviter = auth.uid());
create policy invites_create on public.invites for insert to authenticated with check (inviter = auth.uid());
grant select, insert on public.invites to authenticated;

-- ---------------------------------------------------------------- groups and group challenges
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  owner uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
-- SECURITY DEFINER helper avoids a policy that reads its own table (infinite recursion).
create function public.is_group_member(g uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.group_members where group_id = g and user_id = u)
$$;
revoke all on function public.is_group_member(uuid, uuid) from public;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;
create policy groups_read on public.groups for select to authenticated using (owner = auth.uid() or public.is_group_member(id, auth.uid()));
create policy groups_create on public.groups for insert to authenticated with check (owner = auth.uid());
create policy groups_owner on public.groups for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy groups_delete on public.groups for delete to authenticated using (owner = auth.uid());
create policy members_read on public.group_members for select to authenticated using (public.is_group_member(group_id, auth.uid()));
create policy members_leave on public.group_members for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
-- Joining happens through an invite function in a later round (not exposed yet).

create table public.group_challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  definition_id text not null,
  definition_version int not null,
  starts_on date not null,
  ends_on date not null check (ends_on > starts_on),
  target int not null check (target > 0)
);
alter table public.group_challenges enable row level security;
create policy gchallenges_read on public.group_challenges for select to authenticated using (public.is_group_member(group_id, auth.uid()));
grant select on public.group_challenges to authenticated;

-- ---------------------------------------------------------------- feed foundation: shared achievements + kudos ("יישר כוח")
create table public.shared_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null check (achievement_id ~ '^A[0-9]{2}$'),
  shared_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);
alter table public.shared_achievements enable row level security;
create policy shared_own on public.shared_achievements for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy shared_friends on public.shared_achievements for select to authenticated using (public.are_friends(auth.uid(), user_id));
grant select, insert, delete on public.shared_achievements to authenticated;

create table public.kudos (
  from_user uuid not null references auth.users(id) on delete cascade,
  shared_id uuid not null references public.shared_achievements(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (from_user, shared_id)
);
alter table public.kudos enable row level security;
create policy kudos_give on public.kudos for insert to authenticated
  with check (from_user = auth.uid() and exists (
    select 1 from public.shared_achievements s where s.id = shared_id and public.are_friends(auth.uid(), s.user_id)));
create policy kudos_read on public.kudos for select to authenticated
  using (from_user = auth.uid() or exists (select 1 from public.shared_achievements s where s.id = shared_id and s.user_id = auth.uid()));
create policy kudos_take_back on public.kudos for delete to authenticated using (from_user = auth.uid());
grant select, insert, delete on public.kudos to authenticated;

-- ---------------------------------------------------------------- reports (moderation)
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references auth.users(id) on delete cascade,
  reported_user uuid references auth.users(id) on delete set null,
  target_kind text not null check (target_kind in ('profile', 'shared_achievement', 'group')),
  target_id text not null,
  reason text not null check (reason in ('spam', 'abuse', 'impersonation', 'other')),
  details text check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewing', 'closed')),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
create policy reports_create on public.reports for insert to authenticated with check (reporter = auth.uid() and status = 'open');
create policy reports_own on public.reports for select to authenticated using (reporter = auth.uid());
grant select, insert on public.reports to authenticated;
-- Moderators work with the service role (outside the app); clients cannot read others' reports.
