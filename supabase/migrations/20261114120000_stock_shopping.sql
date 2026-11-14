-- 倉庫 run 3b(stock-shopping): 買い物リスト(shopping_list)・買い物メモ(shopping_memo)・残量で管理の品物の購入日(item.purchased_on)、
-- 自動で載る項目・チェックで残量 ○・品物の削除を整える trigger。
-- 決まり: 30_architecture.md Data Model・Interfaces §1(stock-shopping)、ADR 0004・0009・0010・0011。run 1〜3a の migration は書き換えない。
-- begin・commit は書かない。publication は変えない(変更の知らせは trigger からの broadcast。ADR 0009 の 10)。

-- 1. 残量で管理の品物の購入日(B1。数で管理の品物は item_stock.purchased_on を使い、この列は使わない)。
alter table public.item add column purchased_on date;
comment on column public.item.purchased_on is '残量で管理の品物の購入日。買い物リストでチェックした日(同期した日。日本時間)、在庫登録の購入日が入る。数で管理の品物では使わない(item_stock.purchased_on が持つ)。どの画面にも出ない。';

-- 2. 買い物リスト(1行 = 1項目)と買い物メモ(世帯に1行)。
create table public.shopping_list (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  item_id uuid,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  source text not null check (source in ('regular', 'low', 'out', 'manual', 'recipe')),
  is_checked boolean not null default false,
  is_dismissed boolean not null default false,
  prev_stock_level text check (prev_stock_level in ('full', 'low', 'out')),
  deleted_at timestamptz,
  unique (household_id, id),
  foreign key (household_id, item_id) references public.item (household_id, id) on delete set null (item_id),
  constraint shopping_list_manual_unlinked check (source <> 'manual' or item_id is null),
  constraint shopping_list_auto_linked check (source not in ('regular', 'low', 'out') or item_id is not null or deleted_at is not null)
);

create index shopping_list_updated_idx on public.shopping_list (household_id, updated_at);
create index shopping_list_manual_name_idx on public.shopping_list (household_id, name) where item_id is null and deleted_at is null;
-- 1品物1行(OD-stock-uiux-48 A)。2人の同時の在庫の変更でも、生きている自動の行は2つにならない。
create unique index shopping_list_one_auto_per_item on public.shopping_list (household_id, item_id)
  where deleted_at is null and item_id is not null;

create table public.shopping_memo (
  household_id uuid primary key references public.household (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  body text not null default '' check (char_length(body) <= 10000)
);

comment on table public.shopping_list is '買い物リストの項目(1行1項目)。deleted_at は削除の印(サーバーの時刻。端末が送った値は保存されない)。';
comment on column public.shopping_list.item_id is '自動の行が指す品物。手入力の行は null(名前の一致で品物として扱う)。';
comment on column public.shopping_list.is_dismissed is '自動の行を「外した」。画面に出ないが行として残り、在庫登録の確定まで同じ品物の自動の行を作らせない。';
comment on column public.shopping_list.prev_stock_level is '残量で管理の品物をチェックする前の残量。trigger だけが書く(端末が送っても変わらない)。';
comment on table public.shopping_memo is '買い物メモ。世帯に1行(household の insert の trigger で作る)。全文を1つの値として上書きする(後勝ち)。';

-- 3. RLS・権限・ポリシー。shopping_list は SELECT・INSERT・UPDATE、shopping_memo は SELECT・UPDATE。delete の権限は作らない(削除は印だけ)。
alter table public.shopping_list enable row level security;
revoke all on table public.shopping_list from public, anon, authenticated;
grant select, insert, update on table public.shopping_list to authenticated;
create policy shopping_list_select on public.shopping_list
  for select to authenticated using (household_id in (select private.current_household_ids()));
create policy shopping_list_insert on public.shopping_list
  for insert to authenticated with check (household_id in (select private.current_household_ids()));
create policy shopping_list_update on public.shopping_list
  for update to authenticated
  using (household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));

alter table public.shopping_memo enable row level security;
revoke all on table public.shopping_memo from public, anon, authenticated;
grant select, update on table public.shopping_memo to authenticated;
create policy shopping_memo_select on public.shopping_memo
  for select to authenticated using (household_id in (select private.current_household_ids()));
create policy shopping_memo_update on public.shopping_memo
  for update to authenticated
  using (household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));

-- 4. 関数(すべて private、search_path = ''、誰にも EXECUTE を与えない)。seed_shopping_memo 以外は security invoker(呼んだ人の RLS が効く。ADR 0010 の 4)。

-- 品物1つについて、いま載るべき自動の行に合わせる(Data Model §5。モックの autoSource・syncList と同じ結果)。
create function private.shopping_list_sync_item(p_household_id uuid, p_item_id uuid)
returns void
language plpgsql set search_path = '' as $$
declare
  v_item public.item;
  v_total numeric;
  v_src text;
  v_row public.shopping_list;
begin
  select * into v_item from public.item where household_id = p_household_id and id = p_item_id;
  if not found then
    return;
  end if;

  -- 品物の名前が変わったら、生きている自動の行の名前を直す。
  update public.shopping_list set name = v_item.name
    where household_id = p_household_id and item_id = p_item_id and deleted_at is null and name <> v_item.name;

  if v_item.tracking = 'count' then
    select coalesce(sum(quantity), 0) into v_total from public.item_stock
      where household_id = p_household_id and item_id = p_item_id;
    if v_item.restock_at_count is not null and v_total = 0 then
      v_src := 'out';
    elsif v_item.restock_at_count is not null and v_item.restock_at_count > 0 and v_total <= v_item.restock_at_count then
      v_src := 'low';
    end if;
  else
    if v_item.restock_at_level = 'low' and v_item.stock_level = 'low' then
      v_src := 'low';
    elsif v_item.restock_at_level in ('low', 'out') and v_item.stock_level = 'out' then
      v_src := 'out';
    end if;
  end if;
  if v_src is null and v_item.is_regular then
    v_src := 'regular';
  end if;

  select * into v_row from public.shopping_list
    where household_id = p_household_id and item_id = p_item_id and deleted_at is null;
  if v_src is null then
    -- 載らない: チェックしていず外していない行だけ消す(チェックした行・外した行は残す)。
    if found and not v_row.is_checked and not v_row.is_dismissed then
      update public.shopping_list set deleted_at = now() where id = v_row.id;
    end if;
  elsif found then
    if not v_row.is_checked and not v_row.is_dismissed and v_row.source <> v_src then
      update public.shopping_list set source = v_src where id = v_row.id;
    end if;
  elsif not exists (
    select 1 from public.shopping_list
      where household_id = p_household_id and item_id is null and deleted_at is null and name = v_item.name
  ) then
    insert into public.shopping_list (household_id, item_id, name, source)
      values (p_household_id, p_item_id, v_item.name, v_src)
      on conflict do nothing;
  end if;
end;
$$;

-- 品物の変更 → 自動の行。
create function private.item_shopping_sync() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform private.shopping_list_sync_item(new.household_id, new.id);
  return null;
end;
$$;

-- 品物の削除 → 自動の行と同じ名前の手入力の行に削除の印(OD-stock-uiux-44 A)。外部キーが item_id を空にする。
-- pg_trigger_depth() > 1 は、世帯の削除の cascade のとき(何もしない)。
create function private.item_shopping_release() returns trigger
language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  update public.shopping_list set deleted_at = now()
    where household_id = old.household_id and deleted_at is null
      and (item_id = old.id or (item_id is null and name = old.name));
  return old;
end;
$$;

-- 在庫の変更 → 自動の行(新旧の品物)。
create function private.item_stock_shopping_sync() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform private.shopping_list_sync_item(old.household_id, old.item_id);
  else
    perform private.shopping_list_sync_item(new.household_id, new.item_id);
    if tg_op = 'UPDATE' and old.item_id <> new.item_id then
      perform private.shopping_list_sync_item(old.household_id, old.item_id);
    end if;
  end if;
  return null;
end;
$$;

-- 行の書き込みの前: 削除の印の時刻はサーバー(L-08)、品物の削除の「元に戻す」で戻した行を勝たせる(L-09)、prev_stock_level は trigger だけが変える。
create function private.shopping_list_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.deleted_at := null;
    new.prev_stock_level := null;
    return new;
  end if;
  if new.deleted_at is not null then
    new.deleted_at := coalesce(old.deleted_at, now());
  end if;
  if old.deleted_at is not null and new.deleted_at is null and new.item_id is not null then
    update public.shopping_list set deleted_at = now()
      where household_id = new.household_id and item_id = new.item_id and deleted_at is null and id <> new.id;
  end if;
  if pg_trigger_depth() = 1 then
    new.prev_stock_level := old.prev_stock_level;
  end if;
  return new;
end;
$$;

-- チェックで残量 ○(ST-D03)、外すと前の残量(OD-stock-uiux-17 A)。変化のときだけ動く(同じ値の再送では動かない)。
create function private.shopping_list_check_level() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_item public.item;
begin
  if new.deleted_at is not null then
    return null;
  end if;
  if new.item_id is not null then
    select * into v_item from public.item
      where household_id = new.household_id and id = new.item_id and tracking = 'level';
  else
    select * into v_item from public.item
      where household_id = new.household_id and name = new.name and tracking = 'level';
  end if;
  if not found then
    return null;
  end if;
  if new.is_checked then
    update public.shopping_list set prev_stock_level = v_item.stock_level where id = new.id;
    update public.item set stock_level = 'full', purchased_on = (now() at time zone 'Asia/Tokyo')::date where id = v_item.id;
  elsif new.prev_stock_level is not null then
    update public.item set stock_level = new.prev_stock_level where id = v_item.id;
    update public.shopping_list set prev_stock_level = null where id = new.id;
  end if;
  return null;
end;
$$;

-- 端末からの直接の更新で、行が削除の印を得た・外した印が外れたとき、その品物を合わせ直す(在庫登録の確定で消えた いつもの が戻る、など)。
-- trigger の中からの更新(深さ 2 以上)では呼ばない(繰り返さない)。
create function private.shopping_list_resync() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_item_id uuid;
begin
  if pg_trigger_depth() <> 1 then
    return null;
  end if;
  if not ((old.deleted_at is null and new.deleted_at is not null) or (old.is_dismissed and not new.is_dismissed)) then
    return null;
  end if;
  if new.item_id is not null then
    v_item_id := new.item_id;
  else
    select id into v_item_id from public.item where household_id = new.household_id and name = new.name;
  end if;
  if v_item_id is not null then
    perform private.shopping_list_sync_item(new.household_id, v_item_id);
  end if;
  return null;
end;
$$;

-- household の insert → 買い物メモの行。household の insert は人間の SQL なので security definer(on_household_created と同じ)。
create function private.seed_shopping_memo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.shopping_memo (household_id) values (new.id) on conflict do nothing;
  return null;
end;
$$;

revoke all on function private.shopping_list_sync_item(uuid, uuid) from public, anon, authenticated;
revoke all on function private.item_shopping_sync() from public, anon, authenticated;
revoke all on function private.item_shopping_release() from public, anon, authenticated;
revoke all on function private.item_stock_shopping_sync() from public, anon, authenticated;
revoke all on function private.shopping_list_before_write() from public, anon, authenticated;
revoke all on function private.shopping_list_check_level() from public, anon, authenticated;
revoke all on function private.shopping_list_resync() from public, anon, authenticated;
revoke all on function private.seed_shopping_memo() from public, anon, authenticated;
-- security invoker の trigger の関数が呼ぶので、sync_item だけ authenticated に EXECUTE を与える(trigger の関数自体は trigger が呼ぶので要らない)。
-- private スキーマは API に出ていない。呼んだ人の RLS が効くので、自分の世帯の行にしか触れない。anon・全員には与えない。
grant execute on function private.shopping_list_sync_item(uuid, uuid) to authenticated;

-- 5. trigger(11)。
create trigger item_shopping_sync
  after insert or update of name, tracking, stock_level, restock_at_count, restock_at_level, is_regular on public.item
  for each row execute function private.item_shopping_sync();
create trigger item_shopping_release
  before delete on public.item
  for each row execute function private.item_shopping_release();
create trigger item_stock_shopping_sync
  after insert or update of quantity, item_id or delete on public.item_stock
  for each row execute function private.item_stock_shopping_sync();
create trigger shopping_list_before_write
  before insert or update on public.shopping_list
  for each row execute function private.shopping_list_before_write();
create trigger shopping_list_check_level
  after update of is_checked on public.shopping_list
  for each row when (old.is_checked is distinct from new.is_checked)
  execute function private.shopping_list_check_level();
create trigger shopping_list_resync
  after update of deleted_at, is_dismissed on public.shopping_list
  for each row execute function private.shopping_list_resync();
create trigger shopping_list_set_updated_at before update on public.shopping_list for each row execute function private.set_updated_at();
create trigger shopping_memo_set_updated_at before update on public.shopping_memo for each row execute function private.set_updated_at();
create trigger shopping_list_broadcast after insert or update or delete on public.shopping_list for each row execute function private.broadcast_household_change();
create trigger shopping_memo_broadcast after insert or update or delete on public.shopping_memo for each row execute function private.broadcast_household_change();
create trigger household_seed_shopping_memo after insert on public.household for each row execute function private.seed_shopping_memo();

-- 6. 関数のコメント(どの trigger がほかの行を変えるか。ADR 0010 の「見えない所でほかの行を変える」の注意)。
comment on function private.shopping_list_sync_item(uuid, uuid) is '品物1つの自動の行を、いまの在庫・残量・目安・いつもの に合わせる(行を作る・削除の印・発生元を直す・名前を直す)。item・item_stock・shopping_list の trigger から呼ぶ。';
comment on function private.item_shopping_release() is '品物の削除の前に、その品物の自動の行と同じ名前の手入力の行へ削除の印を付ける。';
comment on function private.shopping_list_before_write() is '削除の印はサーバーの時刻(端末の値は保存されない)。印が外れて戻る自動の行は、同じ品物のほかの生きている自動の行に削除の印を付けて勝つ。prev_stock_level は端末から変えられない。';
comment on function private.shopping_list_check_level() is 'チェックの変化で、残量で管理の品物(item_id、無ければ同じ名前)の残量を full・購入日を今日にし、前の残量を行に控える。外すと前の残量に戻す(購入日は戻さない)。shopping_list の update が item を変える。';
comment on function private.shopping_list_resync() is '端末からの直接の更新で削除の印・外した印が変わったとき、その品物の自動の行を合わせ直す(深さ 1 のときだけ)。';

-- 7. 当てた時点の既存の世帯・品物。
insert into public.shopping_memo (household_id) select id from public.household on conflict do nothing;
select private.shopping_list_sync_item(household_id, id) from public.item;
