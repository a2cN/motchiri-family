-- 倉庫 run 1: マスタ3つ(genre・location・unit)、item、item_stock、更新時刻・変更の知らせ・初期マスタの trigger、realtime.messages のポリシー。
-- 決まり: 30_architecture.md Data Model・Interfaces §1(型紙は tests/policy_template.test.sql)。
-- begin / commit は書かない。メール・ユーザー ID・名前をここに書かない(app/ は public)。初期マスタは要件定義 §7 の一般的な語だけ。

-- 場所。
create table public.location (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  sort_order integer not null,
  unique (household_id, id),
  unique (household_id, name)
);

-- ジャンル。default_location_id = ジャンルの既定の場所(ST-F04)。
create table public.genre (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  default_location_id uuid,
  sort_order integer not null,
  unique (household_id, id),
  unique (household_id, name),
  foreign key (household_id, default_location_id) references public.location (household_id, id)
);

-- 単位。is_countable = ± で数える(OD-stock-uiux-47 A)。
create table public.unit (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  is_countable boolean not null default true,
  sort_order integer not null,
  unique (household_id, id),
  unique (household_id, name)
);

-- 品物。
-- location_id: 残量で管理 = いまの場所 / 数で管理 = 前回の登録の場所(登録画面の初期値)。null は「場所なし」(OD-stock-food-06 (3))。
-- last_expiry_days: 前回の「期限 − 購入日」の日数。null = 前回が無い(期限を入れた最後の登録の値。OD-stock-food-06 (2))。
create table public.item (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  item_kind text not null check (item_kind in ('food', 'supply')),
  tracking text not null check (tracking in ('count', 'level')),
  genre_id uuid,
  unit_id uuid,
  location_id uuid,
  stock_level text check (stock_level in ('full', 'low', 'out')),
  restock_at_count numeric(7, 1) check (restock_at_count >= 0),
  restock_at_level text check (restock_at_level in ('low', 'out')),
  is_regular boolean not null default false,
  last_expiry_days integer,
  unique (household_id, id),
  unique (household_id, name),
  check (item_kind <> 'food' or genre_id is not null),
  check (tracking <> 'count' or unit_id is not null),
  check ((tracking = 'level') = (stock_level is not null)),
  check (tracking = 'count' or restock_at_count is null),
  check (tracking = 'level' or restock_at_level is null),
  foreign key (household_id, genre_id) references public.genre (household_id, id),
  foreign key (household_id, unit_id) references public.unit (household_id, id),
  foreign key (household_id, location_id) references public.location (household_id, id)
);

-- 在庫。
create table public.item_stock (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  item_id uuid not null,
  quantity numeric(7, 1) not null check (quantity >= 0),
  location_id uuid,
  purchased_on date not null default ((now() at time zone 'Asia/Tokyo')::date),
  expires_on date,
  unique (household_id, id),
  foreign key (household_id, item_id) references public.item (household_id, id) on delete cascade,
  foreign key (household_id, location_id) references public.location (household_id, id)
);

comment on column public.item.location_id is '残量で管理: いまの場所 / 数で管理: 前回の登録の場所。null は場所なし。';
comment on column public.item.last_expiry_days is '前回の「期限 - 購入日」の日数。null は前回が無い。';

-- RLS・権限・ポリシー。マスタは SELECT だけ、item は SELECT・INSERT・UPDATE、item_stock は4つ(run 2 以降が足す)。
alter table public.location enable row level security;
revoke all on table public.location from public, anon, authenticated;
grant select on table public.location to authenticated;
create policy location_select on public.location
  for select to authenticated using (household_id in (select private.current_household_ids()));

alter table public.genre enable row level security;
revoke all on table public.genre from public, anon, authenticated;
grant select on table public.genre to authenticated;
create policy genre_select on public.genre
  for select to authenticated using (household_id in (select private.current_household_ids()));

alter table public.unit enable row level security;
revoke all on table public.unit from public, anon, authenticated;
grant select on table public.unit to authenticated;
create policy unit_select on public.unit
  for select to authenticated using (household_id in (select private.current_household_ids()));

alter table public.item enable row level security;
revoke all on table public.item from public, anon, authenticated;
grant select, insert, update on table public.item to authenticated;
create policy item_select on public.item
  for select to authenticated using (household_id in (select private.current_household_ids()));
create policy item_insert on public.item
  for insert to authenticated with check (household_id in (select private.current_household_ids()));
create policy item_update on public.item
  for update to authenticated
  using (household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));

alter table public.item_stock enable row level security;
revoke all on table public.item_stock from public, anon, authenticated;
grant select, insert, update, delete on table public.item_stock to authenticated;
create policy item_stock_select on public.item_stock
  for select to authenticated using (household_id in (select private.current_household_ids()));
create policy item_stock_insert on public.item_stock
  for insert to authenticated with check (household_id in (select private.current_household_ids()));
create policy item_stock_update on public.item_stock
  for update to authenticated
  using (household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));
create policy item_stock_delete on public.item_stock
  for delete to authenticated using (household_id in (select private.current_household_ids()));

-- 索引(unique (household_id, …) が先頭に household_id を持つので、それ以外だけ)。
create index item_stock_item_idx on public.item_stock (household_id, item_id);
create index item_stock_location_idx on public.item_stock (household_id, location_id);
create index item_genre_idx on public.item (household_id, genre_id);

-- 関数(private。trigger からだけ動くので誰にも EXECUTE を与えない)。
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

-- 変更の知らせを、世帯ごとの非公開のチャンネル(topic household:<id>)へ送る(D-10)。
create function private.broadcast_household_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.broadcast_changes(
    'household:' || coalesce(new.household_id, old.household_id)::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end
$$;
revoke all on function private.broadcast_household_change() from public, anon, authenticated;

-- 初期マスタ(要件定義 §7)。何度呼んでも同じ。
create function private.seed_household_masters(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.location (household_id, name, sort_order) values
    (p_household_id, '冷蔵庫', 1),
    (p_household_id, '冷凍庫', 2),
    (p_household_id, '野菜室', 3),
    (p_household_id, '棚', 4)
  on conflict (household_id, name) do nothing;

  insert into public.genre (household_id, name, default_location_id, sort_order)
  select p_household_id, g.name, l.id, g.sort_order
  from (values
    ('野菜・果物', '冷蔵庫', 1),
    ('肉', '冷蔵庫', 2),
    ('魚', '冷蔵庫', 3),
    ('卵・乳製品', '冷蔵庫', 4),
    ('冷凍食品', '冷凍庫', 5),
    ('主食(米・パン・麺)', '棚', 6),
    ('調味料', '棚', 7),
    ('飲み物', '棚', 8),
    ('お菓子', '棚', 9),
    ('その他', '棚', 10)
  ) as g (name, location_name, sort_order)
  join public.location as l on l.household_id = p_household_id and l.name = g.location_name
  on conflict (household_id, name) do nothing;

  insert into public.unit (household_id, name, is_countable, sort_order) values
    (p_household_id, '個', true, 1),
    (p_household_id, '本', true, 2),
    (p_household_id, 'パック', true, 3),
    (p_household_id, '袋', true, 4),
    (p_household_id, '枚', true, 5),
    (p_household_id, 'g', false, 6),
    (p_household_id, 'ml', false, 7)
  on conflict (household_id, name) do nothing;
end
$$;
revoke all on function private.seed_household_masters(uuid) from public, anon, authenticated;

create function private.on_household_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.seed_household_masters(new.id);
  return null;
end
$$;
revoke all on function private.on_household_created() from public, anon, authenticated;

-- trigger。
create trigger location_set_updated_at before update on public.location for each row execute function private.set_updated_at();
create trigger genre_set_updated_at before update on public.genre for each row execute function private.set_updated_at();
create trigger unit_set_updated_at before update on public.unit for each row execute function private.set_updated_at();
create trigger item_set_updated_at before update on public.item for each row execute function private.set_updated_at();
create trigger item_stock_set_updated_at before update on public.item_stock for each row execute function private.set_updated_at();

create trigger location_broadcast after insert or update or delete on public.location for each row execute function private.broadcast_household_change();
create trigger genre_broadcast after insert or update or delete on public.genre for each row execute function private.broadcast_household_change();
create trigger unit_broadcast after insert or update or delete on public.unit for each row execute function private.broadcast_household_change();
create trigger item_broadcast after insert or update or delete on public.item for each row execute function private.broadcast_household_change();
create trigger item_stock_broadcast after insert or update or delete on public.item_stock for each row execute function private.broadcast_household_change();

create trigger household_seed_masters after insert on public.household for each row execute function private.on_household_created();

-- 非公開のチャンネルの読み取り: 自分の世帯の topic だけ。INSERT・UPDATE のポリシーは作らない(送れるのは DB の trigger だけ)。
create policy household_broadcast_select on realtime.messages
  for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) in (select 'household:' || h::text from private.current_household_ids() as h)
  );

-- 当てた時点の既存の世帯に初期マスタを入れる。
select private.seed_household_masters(id) from public.household;
