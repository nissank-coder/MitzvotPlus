-- "לומדים יחד", part 3: the user's own copy of the data includes the challenges too (data rights).
-- Only what is the user's: the challenges joined, own invitations, cheers given and received – the
-- partner's progress is not the user's data and is not exported.
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
    'reports', coalesce((select jsonb_agg(to_jsonb(r)) from public.reports r where r.reporter = u), '[]'),
    'togetherChallenges', coalesce((select jsonb_agg(jsonb_build_object('challengeId', c.id, 'definition', c.definition, 'startDate', c.start_date, 'endDate', c.end_date,
        'status', c.status, 'joinedAt', m.joined_at, 'leftAt', m.left_at, 'createdByMe', c.created_by = u))
      from public.together_members m join public.together_challenges c on c.id = m.challenge_id where m.user_id = u), '[]'),
    'togetherInvitations', coalesce((select jsonb_agg(jsonb_build_object('challengeId', i.challenge_id, 'createdAt', i.created_at, 'expiresAt', i.expires_at, 'used', i.used_at is not null))
      from public.together_invites i where i.inviter = u), '[]'),
    'togetherCheersGiven', coalesce((select jsonb_agg(jsonb_build_object('challengeId', k.challenge_id, 'day', k.day)) from public.together_cheers k where k.from_user = u), '[]'),
    'togetherCheersReceived', coalesce((select jsonb_agg(jsonb_build_object('challengeId', k.challenge_id, 'day', k.day)) from public.together_cheers k where k.to_user = u), '[]')
  );
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
