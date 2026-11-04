-- ログインと世帯: household・member、「自分の世帯」を返す関数、RLS、権限。
-- 決まり: 30_architecture.md Interfaces §1(テーブルごとに RLS を有効にし、全部の権限を取り消してから、要るものだけを authenticated に GRANT する)。
-- begin / commit は書かない(CLI が各ファイルをトランザクションに包む。SQL エディタでも1回の実行として貼る)。
-- メール・ユーザー ID・名前をここに書かない(app/ は public)。

-- 世帯。名前・表示名は持たない。
create table public.household (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.household enable row level security;
revoke all on table public.household from public, anon, authenticated;
grant select on table public.household to authenticated;

-- メンバー。ログインする利用者と世帯の対応。1人は1つの世帯にだけ属する(主キーが user_id)。
create table public.member (
  user_id uuid primary key references auth.users (id) on delete cascade,
  household_id uuid not null references public.household (id) on delete restrict,
  created_at timestamptz not null default now()
);

create index member_household_id_idx on public.member (household_id);

alter table public.member enable row level security;
revoke all on table public.member from public, anon, authenticated;
grant select on table public.member to authenticated;

-- Data API に出さないスキーマ(config.toml の api.schemas に入れない)。
create schema private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

-- いまの利用者(auth.uid())が属する世帯の ID。security definer なので、member のポリシーから呼んでも再帰しない。
create function private.current_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.household_id
  from public.member as m
  where m.user_id = (select auth.uid())
$$;

revoke all on function private.current_household_ids() from public, anon, authenticated;
grant execute on function private.current_household_ids() to authenticated;

-- ポリシー(すべて to authenticated)。書き込みのポリシーは無い(書き込みは人間が SQL エディタで行う)。
create policy household_select on public.household
  for select to authenticated
  using (id in (select private.current_household_ids()));

create policy member_select on public.member
  for select to authenticated
  using (household_id in (select private.current_household_ids()));
