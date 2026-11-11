-- Rollcall attendance system
-- Run through the Supabase SQL Editor, or apply with the Supabase CLI:
--   supabase db push
--
-- Replace admin@your-school.edu.ng before applying this migration.
-- Auth passwords are managed by Supabase Auth and are never stored here.

-- ---------------------------------------------------------------------------
-- Profiles and the administrator email whitelist
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'student'
    check (role in ('student', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Create a profile for anyone who registered before this migration was applied.
insert into public.profiles (id, full_name, role)
select id, raw_user_meta_data ->> 'full_name', 'student'
from auth.users
on conflict (id) do nothing;

create table if not exists public.admin_emails (
  email text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table public.admin_emails enable row level security;
revoke all on public.admin_emails from anon, authenticated;

-- Add every email address allowed to become an administrator here, in lowercase.
insert into public.admin_emails (email)
values ('admin@your-school.edu.ng')
on conflict (email) do nothing;

-- New sign-ups get an admin role only when their email is in public.admin_emails.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    case when exists (
      select 1
      from public.admin_emails ae
      where ae.email = lower(new.email)
    ) then 'admin' else 'student' end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Promote users who registered before their email was whitelisted.
update public.profiles p
set role = 'admin'
from auth.users u
where p.id = u.id
  and exists (
    select 1 from public.admin_emails ae where ae.email = lower(u.email)
  );

-- A user can read their own role, but cannot change their role from the browser.
drop policy if exists "Users can read their own profile" on public.profiles;
drop policy if exists "Users can update their own profile" on public.profiles;

create policy "Users can read their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

revoke update on public.profiles from authenticated;
grant select on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Role helper
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Attendance sessions and QR-code tokens
-- ---------------------------------------------------------------------------

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  course text not null check (char_length(course) between 2 and 120),
  starts_at timestamptz not null default now(),
  closes_at timestamptz not null default (now() + interval '12 hours'),
  qr_token uuid not null unique default gen_random_uuid(),
  created_by uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint attendance_sessions_valid_window check (closes_at > starts_at)
);

create index if not exists attendance_sessions_created_by_idx
  on public.attendance_sessions (created_by);
create index if not exists attendance_sessions_qr_token_idx
  on public.attendance_sessions (qr_token);

alter table public.attendance_sessions enable row level security;
revoke all on public.attendance_sessions from anon, authenticated;
grant select, insert, update, delete on public.attendance_sessions to authenticated;

drop policy if exists "Admins manage attendance sessions" on public.attendance_sessions;
create policy "Admins manage attendance sessions"
on public.attendance_sessions for all to authenticated
using ((select public.is_admin()))
with check (
  (select public.is_admin())
  and created_by = (select auth.uid())
);

-- ---------------------------------------------------------------------------
-- A student can have exactly one attendance record per session.
-- ---------------------------------------------------------------------------

create table if not exists public.attendance_records (
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

create index if not exists attendance_records_student_id_idx
  on public.attendance_records (student_id);
create index if not exists attendance_records_session_id_idx
  on public.attendance_records (session_id);

alter table public.attendance_records enable row level security;
revoke all on public.attendance_records from anon, authenticated;
grant select on public.attendance_records to authenticated;

drop policy if exists "Students read own attendance and admins read all" on public.attendance_records;
create policy "Students read own attendance and admins read all"
on public.attendance_records for select to authenticated
using (
  student_id = (select auth.uid())
  or (select public.is_admin())
);

-- ---------------------------------------------------------------------------
-- This is the only browser-accessible way to mark attendance.
-- It validates the signed-in user, active QR token, time window, and duplicates.
-- ---------------------------------------------------------------------------

create or replace function public.mark_attendance(p_qr_token uuid)
returns table (
  attendance_session_id uuid,
  attendance_time timestamptz,
  already_marked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_id uuid;
  v_scanned_at timestamptz;
  v_new_record boolean := false;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to mark attendance.';
  end if;

  select s.id into v_session_id
  from public.attendance_sessions s
  where s.qr_token = p_qr_token
    and s.cancelled_at is null
    and now() >= s.starts_at
    and now() <= s.closes_at;

  if v_session_id is null then
    raise exception 'This QR code is invalid, expired, or unavailable.';
  end if;

  insert into public.attendance_records (session_id, student_id)
  values (v_session_id, auth.uid())
  on conflict (session_id, student_id) do nothing
  returning scanned_at into v_scanned_at;

  if v_scanned_at is not null then
    v_new_record := true;
  else
    select scanned_at into v_scanned_at
    from public.attendance_records
    where session_id = v_session_id and student_id = auth.uid();
  end if;

  return query select v_session_id, v_scanned_at, not v_new_record;
end;
$$;

revoke all on function public.mark_attendance(uuid) from public;
grant execute on function public.mark_attendance(uuid) to authenticated;
