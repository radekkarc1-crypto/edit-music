-- EDIT MUSIC database blueprint
-- Apply through Supabase SQL editor when the project is created.
-- RLS is enabled on every exposed table.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  storage_path text,
  duration_seconds numeric,
  format text,
  is_public boolean not null default true,
  allow_download boolean not null default true,
  rights_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.edits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  track_id uuid references public.tracks(id) on delete set null,
  title text not null,
  tag text,
  storage_path text,
  cover_path text,
  duration_seconds numeric,
  play_count bigint not null default 0,
  is_public boolean not null default true,
  allow_download boolean not null default true,
  rights_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  edit_id uuid not null references public.edits(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, edit_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  edit_id uuid not null references public.edits(id) on delete cascade,
  body text not null check (char_length(body) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles(id) on delete set null,
  edit_id uuid references public.edits(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists edits_created_at_idx on public.edits(created_at desc);
create index if not exists edits_owner_id_idx on public.edits(owner_id);
create index if not exists comments_edit_id_idx on public.comments(edit_id);
create index if not exists reports_status_idx on public.reports(status);

alter table public.profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.edits enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.reports enable row level security;

create policy "profiles public read" on public.profiles for select to anon, authenticated using (true);
create policy "profiles own insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles own update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "public tracks read" on public.tracks for select to anon, authenticated using (is_public or (select auth.uid()) = owner_id);
create policy "tracks own insert" on public.tracks for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "tracks own update" on public.tracks for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "tracks own delete" on public.tracks for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "public edits read" on public.edits for select to anon, authenticated using (is_public or (select auth.uid()) = owner_id);
create policy "edits own insert" on public.edits for insert to authenticated with check ((select auth.uid()) = owner_id and rights_confirmed = true);
create policy "edits own update" on public.edits for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "edits own delete" on public.edits for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "likes public read" on public.likes for select to anon, authenticated using (true);
create policy "likes own insert" on public.likes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "likes own delete" on public.likes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "comments public read" on public.comments for select to anon, authenticated using (true);
create policy "comments own insert" on public.comments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "comments own update" on public.comments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "comments own delete" on public.comments for delete to authenticated using ((select auth.uid()) = user_id);

create policy "follows public read" on public.follows for select to anon, authenticated using (true);
create policy "follows own insert" on public.follows for insert to authenticated with check ((select auth.uid()) = follower_id);
create policy "follows own delete" on public.follows for delete to authenticated using ((select auth.uid()) = follower_id);

create policy "reports own insert" on public.reports for insert to authenticated with check ((select auth.uid()) = reporter_id);
create policy "reports own read" on public.reports for select to authenticated using ((select auth.uid()) = reporter_id);


-- Private audio bucket. Public downloads are never exposed directly.
insert into storage.buckets (id, name, public)
values ('edits', 'edits', false)
on conflict (id) do update set public = false;

create policy "edit audio owner upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'edits'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "edit audio owner delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'edits'
  and owner_id = (select auth.uid()::text)
);

create policy "edit audio owner read"
on storage.objects for select to authenticated
using (
  bucket_id = 'edits'
  and owner_id = (select auth.uid()::text)
);

-- Public EditTok playback is allowed only when the related edit is public.
-- Download permission is enforced separately by the app before issuing a download URL.
create policy "public edit audio read"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'edits'
  and exists (
    select 1
    from public.edits e
    where e.storage_path = storage.objects.name
      and e.is_public = true
  )
);
