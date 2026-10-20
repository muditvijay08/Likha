-- Local test only: mimics the parts of Supabase the schema relies on.
-- Do NOT run this on Supabase.
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  phone text unique,
  email text,
  created_at timestamptz default now()
);

create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.jwt() returns jsonb language sql stable as
$$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

create or replace function auth.role() returns text language sql stable as
$$ select coalesce(auth.jwt()->>'role', 'anon') $$;

create table if not exists storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable as
$$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;

grant usage on schema auth, storage, extensions, public to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant all on storage.objects to authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;

do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
