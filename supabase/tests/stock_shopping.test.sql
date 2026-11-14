-- 倉庫 run 3b(stock-shopping)の確かめ(30_architecture.md Interfaces §3)。
--  1 自動で載る / 2 1品物1行 / 3 外す / 4 チェックで残量 / 5 在庫登録の区切り / 6 品物の削除 / 7 削除の印の時刻 / 8 メモ / 9 分離 / 10 変更の知らせ / 11 自己テスト
-- 世帯 A に A1、世帯 B に B1。メールは example.com の架空のもの。最後に rollback。
begin;
select plan(67);

create function pg_temp.affected_rows(statement text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end
$$;
-- 品物の、生きている自動の行の数と発生元
create function pg_temp.live(p_item uuid) returns bigint language sql as $$
  select count(*) from public.shopping_list where item_id = p_item and deleted_at is null
$$;
create function pg_temp.src(p_item uuid) returns text language sql as $$
  select source from public.shopping_list where item_id = p_item and deleted_at is null
$$;
create function pg_temp.level_of(p_item uuid) returns text language sql as $$
  select stock_level from public.item where id = p_item
$$;
grant execute on function pg_temp.affected_rows(text), pg_temp.live(uuid), pg_temp.src(uuid), pg_temp.level_of(uuid) to public;

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'a1@example.com'),
  ('b1000000-0000-4000-8000-000000000003', 'b1@example.com');
insert into public.household (id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a'),
  ('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.member (user_id, household_id) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a'),
  ('b1000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b');

-- 準備(postgres)。品物は日用品で作る(ジャンル・場所が要らない)。
--  ミルク: 数・目安 1 / ゼロ: 数・目安 0(切れたら) / ナシ: 数・目安なし / 洗剤: 残量・目安 △ / ソース: 残量・目安 × / おこめ: 数・いつもの
insert into public.item (id, household_id, name, item_kind, tracking, unit_id, restock_at_count, is_regular) values
  ('a1000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ミルク', 'supply', 'count',
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個'), 1, false),
  ('a1000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ゼロ', 'supply', 'count',
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個'), 0, false),
  ('a1000000-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ナシ', 'supply', 'count',
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個'), null, false),
  ('a1000000-0000-4000-8000-0000000000a6', 'aaaaaaaa-0000-4000-8000-00000000000a', 'おこめ', 'supply', 'count',
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個'), null, true);
insert into public.item (id, household_id, name, item_kind, tracking, stock_level, restock_at_level) values
  ('a1000000-0000-4000-8000-0000000000a4', 'aaaaaaaa-0000-4000-8000-00000000000a', '洗剤', 'supply', 'level', 'full', 'low'),
  ('a1000000-0000-4000-8000-0000000000a5', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ソース', 'supply', 'level', 'full', 'out'),
  ('b1000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Bティッシュ', 'supply', 'level', 'full', 'low');

create temp table msg_before as
  select (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'shopping_list' and event = 'UPDATE') as a_list,
         (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'shopping_memo' and event = 'UPDATE') as a_memo;
grant select on pg_temp.msg_before to public;

-- ---- 11 自己テスト(名前付きの制約・部分の一意の索引・trigger 11 個がカタログにある。無ければ以下の「止まる」が別の理由で起きていないことの証明) ----
select is(
  (select count(*) from pg_constraint where conrelid = 'public.shopping_list'::regclass and conname in ('shopping_list_manual_unlinked', 'shopping_list_auto_linked')),
  2::bigint, '自己テスト: 名前付きの制約が2つある'
);
select is(
  (select count(*) from pg_indexes where schemaname = 'public' and indexname = 'shopping_list_one_auto_per_item' and indexdef like '%UNIQUE%deleted_at IS NULL%'),
  1::bigint, '自己テスト: 部分の一意の索引がある'
);
select is(
  (select count(*) from pg_trigger as t where not t.tgisinternal and t.tgname in (
    'item_shopping_sync', 'item_shopping_release', 'item_stock_shopping_sync', 'shopping_list_before_write', 'shopping_list_check_level',
    'shopping_list_resync', 'shopping_list_broadcast', 'shopping_memo_broadcast', 'shopping_list_set_updated_at', 'shopping_memo_set_updated_at',
    'household_seed_shopping_memo')),
  11::bigint, '自己テスト: 3b の trigger が11個ある'
);

-- ---- 8 メモ(postgres) ----
select is(
  (select count(*) from public.shopping_memo where household_id in ('aaaaaaaa-0000-4000-8000-00000000000a', 'bbbbbbbb-0000-4000-8000-00000000000b')),
  2::bigint, 'メモ: 世帯を insert するとメモの行ができる'
);

-- ---- 1 自動で載る(A1) ----
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a6'), 'regular', '自動: いつもの の品物は regular の行が1つ');
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a6'), 1::bigint, '自動: いつもの の行は1つだけ');

insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a1', 2);
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a1'), 0::bigint, '自動: 目安 1・在庫 2 は載らない');
update public.item_stock set quantity = 1 where item_id = 'a1000000-0000-4000-8000-0000000000a1';
select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a1'), 'low', '自動: 目安 1・在庫 1 は low');
update public.item_stock set quantity = 0 where item_id = 'a1000000-0000-4000-8000-0000000000a1';
select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a1'), 'out', '自動: 在庫 0 は out(low の行の発生元が直る)');
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a1'), 1::bigint, '自動: 発生元が変わっても行は1つ');
update public.item_stock set quantity = 2 where item_id = 'a1000000-0000-4000-8000-0000000000a1';
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a1'), 0::bigint, '自動: 在庫が戻ると行に削除の印が付く(チェックしていない行)');

insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a2', 1);
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a2'), 0::bigint, '自動: 目安 0(切れたら)・在庫 1 は載らない');
update public.item_stock set quantity = 0 where item_id = 'a1000000-0000-4000-8000-0000000000a2';
select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a2'), 'out', '自動: 目安 0・在庫 0 は out');

insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a3', 0);
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a3'), 0::bigint, '自動: 目安なしは在庫 0 でも載らない');

update public.item set stock_level = 'low' where id = 'a1000000-0000-4000-8000-0000000000a4';
select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a4'), 'low', '自動: 目安 △・残量 △ は low');
update public.item set stock_level = 'out' where id = 'a1000000-0000-4000-8000-0000000000a4';
select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a4'), 'out', '自動: 目安 △・残量 × は out');
update public.item set stock_level = 'full' where id = 'a1000000-0000-4000-8000-0000000000a4';
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a4'), 0::bigint, '自動: 残量 ○ に戻ると削除の印');
update public.item set stock_level = 'low' where id = 'a1000000-0000-4000-8000-0000000000a5';
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a5'), 0::bigint, '自動: 目安 × は残量 △ で載らない');
update public.item set stock_level = 'out' where id = 'a1000000-0000-4000-8000-0000000000a5';
select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a5'), 'out', '自動: 目安 ×・残量 × は out');

update public.item set restock_at_count = 1 where id = 'a1000000-0000-4000-8000-0000000000a6';
select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a6'), 'out', '自動: 優先は out > regular(目安を足すと発生元が out に直る)');
update public.item set restock_at_count = null where id = 'a1000000-0000-4000-8000-0000000000a6';
select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a6'), 'regular', '自動: 目安を外すと regular に戻る');
update public.item set name = 'こめ' where id = 'a1000000-0000-4000-8000-0000000000a6';
select is((select name from public.shopping_list where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null), 'こめ', '自動: 品物の名前を変えると行の名前が変わる');

-- ---- 2 1品物1行 ----
select throws_ok(
  $$ insert into public.shopping_list (household_id, item_id, name, source) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a6', 'こめ', 'regular') $$,
  '23505', null, '1品物1行: 生きている自動の行を2つ insert できない'
);
insert into public.shopping_list (id, household_id, name, source) values ('a1000000-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ナシ', 'manual');
update public.item set restock_at_count = 0 where id = 'a1000000-0000-4000-8000-0000000000a3';
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a3'), 0::bigint, '1品物1行: 同じ名前の生きている手入力の行があると自動の行は作られない');
select throws_ok(
  $$ insert into public.shopping_list (household_id, name, source, item_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x', 'manual', 'a1000000-0000-4000-8000-0000000000a3') $$,
  '23514', null, '制約: 手入力の行は item_id を持てない'
);

-- ---- 3 外す ----
update public.shopping_list set is_dismissed = true where item_id = 'a1000000-0000-4000-8000-0000000000a5' and deleted_at is null;
update public.item set stock_level = 'full' where id = 'a1000000-0000-4000-8000-0000000000a5';
update public.item set stock_level = 'out' where id = 'a1000000-0000-4000-8000-0000000000a5';
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a5'), 1::bigint, '外す: 条件を外れてまた満たしても、外した行のまま1行(作り直されない)');
select is((select is_dismissed from public.shopping_list where item_id = 'a1000000-0000-4000-8000-0000000000a5' and deleted_at is null), true, '外す: 外した印が残っている');
update public.shopping_list set is_dismissed = false where item_id = 'a1000000-0000-4000-8000-0000000000a5' and deleted_at is null;
select is(pg_temp.src('a1000000-0000-4000-8000-0000000000a5'), 'out', '外す: 印を外すと、条件を満たすので行が戻る');
update public.shopping_list set is_dismissed = true where item_id = 'a1000000-0000-4000-8000-0000000000a5' and deleted_at is null;
update public.item set stock_level = 'full' where id = 'a1000000-0000-4000-8000-0000000000a5';
update public.shopping_list set is_dismissed = false where item_id = 'a1000000-0000-4000-8000-0000000000a5' and deleted_at is null;
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a5'), 0::bigint, '外す: 条件を外れているときに印を外すと、行に削除の印が付く');

-- ---- 4 チェックで残量 ----
update public.item set stock_level = 'low' where id = 'a1000000-0000-4000-8000-0000000000a4';
update public.shopping_list set is_checked = true where item_id = 'a1000000-0000-4000-8000-0000000000a4' and deleted_at is null;
select is(pg_temp.level_of('a1000000-0000-4000-8000-0000000000a4'), 'full', 'チェック: 残量 △ の品物が full になる');
select is((select purchased_on from public.item where id = 'a1000000-0000-4000-8000-0000000000a4'), (now() at time zone 'Asia/Tokyo')::date, 'チェック: 購入日が日本時間の今日になる');
select is((select prev_stock_level from public.shopping_list where item_id = 'a1000000-0000-4000-8000-0000000000a4' and deleted_at is null), 'low', 'チェック: 前の残量が行に控えられる');
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a4'), 1::bigint, 'チェック: 残量が ○ になってもチェックした行は残る');
update public.shopping_list set is_checked = true where item_id = 'a1000000-0000-4000-8000-0000000000a4' and deleted_at is null;
select is((select prev_stock_level from public.shopping_list where item_id = 'a1000000-0000-4000-8000-0000000000a4' and deleted_at is null), 'low', 'チェック: 同じ値の再送で何も変わらない(冪等)');
update public.shopping_list set is_checked = false where item_id = 'a1000000-0000-4000-8000-0000000000a4' and deleted_at is null;
select is(pg_temp.level_of('a1000000-0000-4000-8000-0000000000a4'), 'low', 'チェック: 外すと前の残量(△)に戻る');
select is((select prev_stock_level from public.shopping_list where item_id = 'a1000000-0000-4000-8000-0000000000a4' and deleted_at is null), null, 'チェック: 外すと prev_stock_level が空になる');
-- 手入力の行で、同じ名前の残量の品物にも効く(L-06)
update public.item set stock_level = 'out' where id = 'a1000000-0000-4000-8000-0000000000a4';
update public.shopping_list set deleted_at = now() where item_id = 'a1000000-0000-4000-8000-0000000000a4' and deleted_at is null;
insert into public.shopping_list (id, household_id, name, source) values ('a1000000-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-00000000000a', '洗剤', 'manual');
update public.shopping_list set is_checked = true where id = 'a1000000-0000-4000-8000-0000000000c2';
select is(pg_temp.level_of('a1000000-0000-4000-8000-0000000000a4'), 'full', 'チェック: 手入力の行(同じ名前)でも残量の品物が ○ になる');
-- 数で管理の品物の行では品物が変わらない
update public.shopping_list set is_checked = true where id = 'a1000000-0000-4000-8000-0000000000c1';
select is((select count(*) from public.item_stock where item_id = 'a1000000-0000-4000-8000-0000000000a3'), 1::bigint, 'チェック: 数で管理の品物の在庫は変わらない');

-- ---- 5 在庫登録の区切り(チェックした行に削除の印 → 未チェックの新しい行) ----
update public.shopping_list set is_checked = true where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null;
update public.shopping_list set deleted_at = now() where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null and is_checked;
select is((select is_checked from public.shopping_list where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null), false, '区切り: チェックした いつもの の行に削除の印 → 未チェックの新しい行ができる');
-- 外した行に削除の印 → 満たす品物は新しい行、満たさない品物は無し
update public.shopping_list set is_dismissed = true where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null;
update public.shopping_list set deleted_at = now() where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null and is_dismissed;
select is((select is_dismissed from public.shopping_list where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null), false, '区切り: 外した行に削除の印 → 条件を満たす品物は新しい行');
update public.item set is_regular = false where id = 'a1000000-0000-4000-8000-0000000000a6';
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a6'), 0::bigint, '区切り: 条件を外れた品物の行は消える');

-- ---- 6 品物の削除 ----
update public.item set is_regular = true where id = 'a1000000-0000-4000-8000-0000000000a6';
update public.shopping_list set is_checked = true where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null;
create temp table old_row as select id from public.shopping_list where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null;
grant select on pg_temp.old_row to public;
delete from public.item where id = 'a1000000-0000-4000-8000-0000000000a6';
select is((select deleted_at is not null and item_id is null from public.shopping_list where id = (select id from pg_temp.old_row)), true, '品物の削除: 自動の行に削除の印が付き、item_id が空になる');
-- 同じ id で作り直す → いつもの なら新しい行 → 元の行を戻すと新しい行に削除の印
insert into public.item (id, household_id, name, item_kind, tracking, unit_id, is_regular) values
  ('a1000000-0000-4000-8000-0000000000a6', 'aaaaaaaa-0000-4000-8000-00000000000a', 'こめ', 'supply', 'count',
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個'), true);
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a6'), 1::bigint, '品物の削除: 作り直すと新しい行ができる');
update public.shopping_list set deleted_at = null, item_id = 'a1000000-0000-4000-8000-0000000000a6' where id = (select id from pg_temp.old_row);
select is((select is_checked from public.shopping_list where item_id = 'a1000000-0000-4000-8000-0000000000a6' and deleted_at is null), true, '品物の削除: 元に戻すと、元の行(チェックのまま)が新しい行に勝つ');
select is(pg_temp.live('a1000000-0000-4000-8000-0000000000a6'), 1::bigint, '品物の削除: 元に戻したあとも生きている行は1つ');
-- 手入力の行は、同じ名前の品物の削除で削除の印
insert into public.shopping_list (id, household_id, name, source) values ('a1000000-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ゼロ', 'manual');
delete from public.item where id = 'a1000000-0000-4000-8000-0000000000a2';
select is((select deleted_at is not null from public.shopping_list where id = 'a1000000-0000-4000-8000-0000000000c3'), true, '品物の削除: 同じ名前の手入力の行に削除の印が付く');

-- ---- 7 削除の印の時刻 ----
update public.shopping_list set deleted_at = '2000-01-01' where id = 'a1000000-0000-4000-8000-0000000000c1';
select ok((select deleted_at > now() - interval '1 minute' from public.shopping_list where id = 'a1000000-0000-4000-8000-0000000000c1'), '削除の印: 端末が過去の時刻を送っても now() になる');
update public.shopping_list set deleted_at = '2000-01-01' where id = 'a1000000-0000-4000-8000-0000000000c1';
select ok((select deleted_at > now() - interval '1 minute' from public.shopping_list where id = 'a1000000-0000-4000-8000-0000000000c1'), '削除の印: 印の付いた行に別の時刻を送っても変わらない');
update public.shopping_list set prev_stock_level = 'out' where id = 'a1000000-0000-4000-8000-0000000000c3';
select is((select prev_stock_level from public.shopping_list where id = 'a1000000-0000-4000-8000-0000000000c3'), null, '削除の印: prev_stock_level を端末が送っても変わらない');
insert into public.shopping_list (id, household_id, name, source, deleted_at, prev_stock_level) values ('a1000000-0000-4000-8000-0000000000c4', 'aaaaaaaa-0000-4000-8000-00000000000a', '新規', 'manual', now(), 'low');
select is((select deleted_at is null and prev_stock_level is null from public.shopping_list where id = 'a1000000-0000-4000-8000-0000000000c4'), true, '削除の印: insert では印も prev_stock_level も受け付けない');

-- ---- 8 メモ ----
select is(pg_temp.affected_rows($$ update public.shopping_memo set body = 'メモ' where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' $$), 1::bigint, 'メモ: A1 は自分の世帯のメモを更新できる');
select throws_ok(
  $$ update public.shopping_memo set body = repeat('あ', 10001) where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' $$,
  '23514', null, 'メモ: 10001 字は入らない'
);

-- ---- 9 分離(A1) ----
select is((select count(*) from public.shopping_list where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0::bigint, '分離: A1 に B の買い物リストは見えない');
select is((select count(*) from public.shopping_memo where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0::bigint, '分離: A1 に B のメモは見えない');
select is(pg_temp.affected_rows($$ update public.shopping_memo set body = 'x' where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' $$), 0::bigint, '分離: A1 は B のメモを更新できない(0 行)');
select throws_ok(
  $$ insert into public.shopping_list (household_id, name, source) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'x', 'manual') $$,
  '42501', null, '分離: A1 は B の世帯へ行を insert できない'
);
select throws_ok(
  $$ insert into public.shopping_list (household_id, item_id, name, source) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'b1000000-0000-4000-8000-0000000000b1', 'x', 'regular') $$,
  '23503', null, '分離: B の品物を指す item_id は複合の外部キーで入らない'
);
select throws_ok($$ delete from public.shopping_list $$, '42501', null, '権限: delete は誰もできない(shopping_list)');
select throws_ok($$ delete from public.shopping_memo $$, '42501', null, '権限: delete は誰もできない(shopping_memo)');

-- B1
reset role;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.shopping_list where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 0::bigint, '分離: B1 に A の買い物リストは見えない');
select is(pg_temp.affected_rows($$ update public.shopping_list set is_checked = true where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' $$), 0::bigint, '分離: B1 は A の行を更新できない(0 行)');

-- anon
reset role;
set local role anon;
select throws_ok($$ select * from public.shopping_list $$, '42501', null, '権限: anon は shopping_list を読めない');
select throws_ok($$ select * from public.shopping_memo $$, '42501', null, '権限: anon は shopping_memo を読めない');
reset role;

-- ---- 10 変更の知らせ ----
select ok(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'shopping_list' and event = 'UPDATE') > (select a_list from pg_temp.msg_before),
  '知らせ: 買い物リストの UPDATE が世帯 A の非公開のチャンネルに載る'
);
select ok(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'shopping_memo' and event = 'UPDATE') > (select a_memo from pg_temp.msg_before),
  '知らせ: メモの UPDATE が世帯 A の非公開のチャンネルに載る'
);
select is(
  (select count(*) from realtime.messages where topic = 'household:bbbbbbbb-0000-4000-8000-00000000000b' and payload ->> 'table' in ('shopping_list', 'shopping_memo') and event = 'UPDATE'),
  0::bigint, '知らせ: 世帯 B のチャンネルに A の変更は載らない'
);
select ok(
  not exists (
    select 1 from pg_proc as p join pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname in ('item_shopping_sync', 'item_shopping_release', 'item_stock_shopping_sync', 'shopping_list_before_write', 'shopping_list_check_level', 'shopping_list_resync', 'seed_shopping_memo')
      and (has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
  ) and not has_function_privilege('anon', 'private.shopping_list_sync_item(uuid, uuid)', 'EXECUTE'
  ) and has_function_privilege('authenticated', 'private.shopping_list_sync_item(uuid, uuid)', 'EXECUTE'
  ),
  '権限: 3b の private の関数のうち、authenticated が実行できるのは shopping_list_sync_item だけ(trigger の関数が呼ぶため)。anon はどれも実行できない'
);

select * from finish();
rollback;
