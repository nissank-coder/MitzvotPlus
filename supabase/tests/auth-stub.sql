-- TEST ONLY. Emulates the parts of Supabase that the migrations rely on, so the migrations and the
-- row-level security can be tested on a plain PostgreSQL. Never applied to a real Supabase project
-- (there these objects already exist).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  created_at timestamptz not null default now()
);
-- Same contract as Supabase: the user id comes from the verified JWT claims of the request.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
