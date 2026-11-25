-- טיוטת סכמה לסבב 12 (Supabase / Postgres). לא נפרסה, לא מחוברת לאפליקציה. הסנכרון כבוי.
-- עקרונות: כל טבלה פרטית מוגנת ב-RLS לפי auth.uid(); מידע חברתי בטבלאות נפרדות;
-- הניקוד מחושב בשרת מתוך אירועים; אירוע נקלט פעם אחת לפי event_id (idempotency).

create extension if not exists pgcrypto;

-- פרופיל פרטי: רק המשתמש עצמו קורא וכותב.
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  created_at timestamptz not null default now(),
  consent_cloud_backup boolean not null default false,   -- הסכמה פעילה לגיבוי בענן
  consent_social boolean not null default false,          -- הסכמה נפרדת להופעה אצל חברים
  consent_updated_at timestamptz
);
alter table public.profiles enable row level security;
create policy profiles_self on public.profiles for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- אירועי פעילות (גיבוי פרטי). רק פעולות ש-privacyFor(...).cloudBackup = true נשלחות לכאן.
create table public.activity_events (
  event_id text primary key,                 -- מזהה הרשומה במכשיר: מונע כפילות
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null,
  schema_version int not null check (schema_version >= 2),
  operation text not null check (operation in ('create', 'void')),
  target_event_id text references public.activity_events(event_id),
  action_type text not null,
  local_date date,
  occurred_at timestamptz,
  recorded_at timestamptz not null,
  payload jsonb not null,                    -- הקשר מצומצם בלבד: policyVersion, tzid, il
  received_at timestamptz not null default now()
);
alter table public.activity_events enable row level security;
create policy events_owner_read on public.activity_events for select using (user_id = auth.uid());
create policy events_owner_insert on public.activity_events for insert with check (user_id = auth.uid());
-- אין update/delete ללקוח: ביטול הוא אירוע void; מחיקת חשבון מוחקת הכל (on delete cascade).

-- סירוב בצד השרת לפעולות פרטיות, גם אם לקוח שגוי ישלח אותן.
create or replace function public.reject_private_actions() returns trigger language plpgsql as $$
begin
  if new.action_type in ('cleanSpeech', 'speechPractice', 'charity', 'matanotLaevyonim', 'visitSick', 'personalHabit') then
    raise exception 'private action % is local-only', new.action_type;
  end if;
  return new;
end $$;
create trigger activity_events_private before insert on public.activity_events
  for each row execute function public.reject_private_actions();

-- ניקוד מחושב בשרת (טבלת תוצאות; הלקוח לא כותב אליה).
create table public.daily_scores (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  rules_version text not null,
  points int not null,
  goal_met boolean not null,
  primary key (user_id, local_date)
);
alter table public.daily_scores enable row level security;
create policy scores_owner_read on public.daily_scores for select using (user_id = auth.uid());

-- חברים: בקשה הדדית בהזמנה בלבד.
create table public.friendships (
  requester uuid not null references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;
create policy friendships_parties on public.friendships for select using (auth.uid() in (requester, addressee));
create policy friendships_request on public.friendships for insert with check (requester = auth.uid() and status = 'pending');
create policy friendships_answer on public.friendships for update using (addressee = auth.uid()) with check (status in ('accepted', 'blocked'));

-- קבוצות ואתגרים קבוצתיים.
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
create policy groups_members_read on public.groups for select
  using (exists (select 1 from public.group_members m where m.group_id = id and m.user_id = auth.uid()));
create policy members_self_read on public.group_members for select
  using (exists (select 1 from public.group_members m where m.group_id = group_id and m.user_id = auth.uid()));

-- מה שחבר רואה: יחידת השתתפות יומית בלבד (כן/לא), רק בהסכמה חברתית, בלי סוג פעולה ובלי נקודות.
create view public.friend_participation with (security_invoker = true) as
  select s.user_id, s.local_date, s.goal_met
  from public.daily_scores s
  join public.profiles p on p.user_id = s.user_id and p.consent_social
  where exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and ((f.requester = auth.uid() and f.addressee = s.user_id) or (f.addressee = auth.uid() and f.requester = s.user_id))
  );

-- פיד עתידי: הישגים שהמשתמש בחר לשתף, פריט אחר פריט.
create table public.shared_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  shared_at timestamptz not null default now(),
  unique (user_id, achievement_id)
);
alter table public.shared_achievements enable row level security;
create policy shared_owner on public.shared_achievements for all using (user_id = auth.uid()) with check (user_id = auth.uid());
