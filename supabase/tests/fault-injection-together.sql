-- Fault injection for "לומדים יחד" (CI expects test-db.mjs to FAIL with this applied):
-- 1. cheers lose their once-a-day limit; 2. a challenge is readable by anyone signed in.
alter table public.together_cheers drop constraint together_cheers_challenge_id_from_user_to_user_day_key;
grant select on public.together_members to authenticated;
