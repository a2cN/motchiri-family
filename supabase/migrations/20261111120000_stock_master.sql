-- 倉庫 run 2(stock-master): マスタ3つの書き込みと品物の削除の権限、複数の行にまたがる整合を守る trigger 4つ。
-- 決まり: 30_architecture.md Data Model・Interfaces §1(stock-master)、ADR 0009。run 1 の migration(20261109150000_stock_food.sql)は書き換えない。
-- テーブル・列・制約・索引は変えない。足すのは権限・ポリシー・trigger だけ。begin・commit は書かない。

-- 1. 権限とポリシー: マスタ3つに INSERT・UPDATE・DELETE、item に DELETE を足す(anon・service_role には何も足さない)。
grant insert, update, delete on table public.genre to authenticated;
grant insert, update, delete on table public.location to authenticated;
grant insert, update, delete on table public.unit to authenticated;
grant delete on table public.item to authenticated;

create policy genre_insert on public.genre
  for insert to authenticated with check (household_id in (select private.current_household_ids()));
create policy genre_update on public.genre
  for update to authenticated
  using (household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));
create policy genre_delete on public.genre
  for delete to authenticated using (household_id in (select private.current_household_ids()));

create policy location_insert on public.location
  for insert to authenticated with check (household_id in (select private.current_household_ids()));
create policy location_update on public.location
  for update to authenticated
  using (household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));
create policy location_delete on public.location
  for delete to authenticated using (household_id in (select private.current_household_ids()));

create policy unit_insert on public.unit
  for insert to authenticated with check (household_id in (select private.current_household_ids()));
create policy unit_update on public.unit
  for update to authenticated
  using (household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));
create policy unit_delete on public.unit
  for delete to authenticated using (household_id in (select private.current_household_ids()));

create policy item_delete on public.item
  for delete to authenticated using (household_id in (select private.current_household_ids()));

-- 2. trigger の関数。すべて private、security invoker(中の書き込みにも呼んだ人の RLS が効く)、search_path = ''。

-- 管理のしかたが数 → 残量に変わった品物の在庫を、同じトランザクションで消す。
create function private.item_drop_stocks_on_level() returns trigger
language plpgsql set search_path = '' as $$
begin
  delete from public.item_stock where household_id = new.household_id and item_id = new.id;
  return null;
end;
$$;

-- 在庫は、数で管理の品物にしか作れない。for share で、同時に残量へ変えている途中の品物の更新が終わるのを待つ。
create function private.item_stock_require_count_item() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform 1 from public.item
    where household_id = new.household_id and id = new.item_id and tracking = 'count'
    for share;
  if not found then
    raise exception 'item_stock_requires_count_item: item % is not tracked by count', new.item_id
      using errcode = '23514';
  end if;
  return null;
end;
$$;

-- 場所を消す前に、使用中でない参照(ジャンルの既定の場所、数で管理の品物の前回の場所)を空にする。
-- 使用中の参照(在庫の場所、残量で管理の品物の場所)は外部キーが止める。止まると、この更新も含めて全部が取り消される。
-- pg_trigger_depth() > 1 は、世帯の削除の cascade のとき(参照する行も同じ文で消える)は何もしない。
create function private.location_release_references() returns trigger
language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  update public.genre set default_location_id = null
    where household_id = old.household_id and default_location_id = old.id;
  update public.item set location_id = null
    where household_id = old.household_id and location_id = old.id and tracking = 'count';
  return old;
end;
$$;

-- 単位を消す前に、残量で管理の品物に残した単位を空にする(数で管理の品物の単位は使用中で、外部キーが止める)。
create function private.unit_release_references() returns trigger
language plpgsql set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then
    return old;
  end if;
  update public.item set unit_id = null
    where household_id = old.household_id and unit_id = old.id and tracking = 'level';
  return old;
end;
$$;

revoke all on function private.item_drop_stocks_on_level() from public, anon, authenticated;
revoke all on function private.item_stock_require_count_item() from public, anon, authenticated;
revoke all on function private.location_release_references() from public, anon, authenticated;
revoke all on function private.unit_release_references() from public, anon, authenticated;

-- 3. trigger。
create trigger item_drop_stocks_on_level
  after update of tracking on public.item
  for each row when (old.tracking = 'count' and new.tracking = 'level')
  execute function private.item_drop_stocks_on_level();

create trigger item_stock_require_count_item
  after insert or update of item_id on public.item_stock
  for each row execute function private.item_stock_require_count_item();

create trigger location_release_references
  before delete on public.location
  for each row execute function private.location_release_references();

create trigger unit_release_references
  before delete on public.unit
  for each row execute function private.unit_release_references();

-- 4. 参照の種類(固い参照は削除を止め、やわらかい参照は消すと空になる)。
comment on function private.item_drop_stocks_on_level() is '品物の管理のしかたが数 → 残量に変わったら、その品物の在庫を同じトランザクションで消す。';
comment on function private.item_stock_require_count_item() is '在庫の行が指す品物は数で管理でなければならない(23514)。';
comment on function private.location_release_references() is '場所の参照の種類。固い(削除を止める): item_stock.location_id、残量で管理の item.location_id。やわらかい(消すと null): genre.default_location_id、数で管理の item.location_id。';
comment on function private.unit_release_references() is '単位の参照の種類。固い(削除を止める): 数で管理の item.unit_id。やわらかい(消すと null): 残量で管理の item.unit_id。ジャンルの固い参照は食材の item.genre_id(trigger は無い)。';
