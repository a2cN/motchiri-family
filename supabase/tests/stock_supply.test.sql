-- 倉庫 run 3a(stock-supply)の確かめ(30_architecture.md Interfaces §8)。
--  1 形 / 2 数の日用品の在庫 / 3 分離 / 4 使用中 / 5 管理のしかた / 6 変更の知らせ / 7 自己テスト
-- 世帯 A に A1、世帯 B に B1。メールは example.com の架空のもの。最後に rollback。
begin;
select plan(28);

create function pg_temp.affected_rows(statement text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end
$$;

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'a1@example.com'),
  ('b1000000-0000-4000-8000-000000000003', 'b1@example.com');
insert into public.household (id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a'),
  ('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.member (user_id, household_id) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a'),
  ('b1000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b');

-- 準備(postgres)
-- ラップ: 日用品・数・単位 個・ジャンルと備考あり / シャンプー: 日用品・残量 / B のティッシュ: 日用品・残量 / 食材の牛乳
insert into public.item (id, household_id, name, item_kind, tracking, unit_id, supply_genre, note) values
  ('a1000000-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-00000000000a', 'ラップ', 'supply', 'count',
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個'), 'キッチン', '30cm');
insert into public.item (id, household_id, name, item_kind, tracking, stock_level, restock_at_level) values
  ('a1000000-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-00000000000a', 'シャンプー', 'supply', 'level', 'full', 'low'),
  ('b1000000-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-00000000000b', 'Bティッシュ', 'supply', 'level', 'full', 'low');
insert into public.item (id, household_id, name, item_kind, tracking, genre_id, unit_id, location_id) values
  ('a1000000-0000-4000-8000-0000000000a3', 'aaaaaaaa-0000-4000-8000-00000000000a', '牛乳', 'food', 'count',
    (select id from public.genre where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '卵・乳製品'),
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個'),
    (select id from public.location where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '冷蔵庫'));

create temp table msg_before as
  select (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'item' and event = 'UPDATE') as a;
grant select on pg_temp.msg_before to public;

-- ---- 7 自己テスト(check が 6 つある) ----
select is(
  (select count(*) from pg_constraint where conrelid = 'public.item'::regclass
    and conname in ('item_supply_genre_format', 'item_note_format', 'item_supply_genre_only_supply', 'item_note_only_supply', 'item_supply_no_genre_master', 'item_supply_no_location')),
  6::bigint, '自己テスト: 日用品の形の check が6つある(1 の 23514 はこれらによる)'
);

-- ---- 1 形・3 分離: A1 ----
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, stock_level, genre_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x1', 'supply', 'level', 'full', (select id from public.genre limit 1)) $$,
  '23514', null, '形: 日用品にジャンルのマスタを入れられない'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, stock_level, location_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x2', 'supply', 'level', 'full', (select id from public.location limit 1)) $$,
  '23514', null, '形: 日用品に場所を入れられない'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, genre_id, unit_id, supply_genre) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x3', 'food', 'count', (select id from public.genre limit 1), (select id from public.unit limit 1), 'あ') $$,
  '23514', null, '形: 食材に supply_genre を入れられない'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, genre_id, unit_id, note) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x4', 'food', 'count', (select id from public.genre limit 1), (select id from public.unit limit 1), 'あ') $$,
  '23514', null, '形: 食材に note を入れられない'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, stock_level, supply_genre) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x5', 'supply', 'level', 'full', '') $$,
  '23514', null, '形: 空の supply_genre は入らない(null で持つ)'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, stock_level, supply_genre) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x6', 'supply', 'level', 'full', ' あ') $$,
  '23514', null, '形: 前後に空白のある supply_genre は入らない'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, stock_level, note) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x7', 'supply', 'level', 'full', 'あ ') $$,
  '23514', null, '形: 前後に空白のある note は入らない'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, stock_level, supply_genre) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x8', 'supply', 'level', 'full', repeat('あ', 101)) $$,
  '23514', null, '形: 101字の supply_genre は入らない'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, stock_level, note) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'x9', 'supply', 'level', 'full', repeat('あ', 1001)) $$,
  '23514', null, '形: 1001字の note は入らない'
);
select is(pg_temp.affected_rows($$ insert into public.item (household_id, name, item_kind, tracking, stock_level, supply_genre, note) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'ok1', 'supply', 'level', 'full', 'バス', E'1行目\n2行目') $$), 1::bigint, '形: ジャンルと備考(改行あり)つきの残量の日用品は入る');
select is(pg_temp.affected_rows($$ insert into public.item (household_id, name, item_kind, tracking, stock_level) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'ok2', 'supply', 'level', 'low') $$), 1::bigint, '形: ジャンルも備考も無い日用品は入る');

-- ---- 2 数の日用品の在庫 ----
select is(pg_temp.affected_rows($$ insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a1', 0) $$), 1::bigint, '在庫: 数の日用品に quantity 0・場所なしの在庫を入れられる');
select throws_ok(
  $$ insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a2', 1) $$,
  '23514', null, '在庫: 残量で管理の日用品には在庫を入れられない(run 2 の trigger が日用品にも効く)'
);

-- ---- 3 分離 ----
select is(pg_temp.affected_rows($$ update public.item set supply_genre = '台所', note = '変えた', stock_level = 'low' where id = 'a1000000-0000-4000-8000-0000000000a2' $$), 1::bigint, '分離: A1 は自分の世帯の日用品の supply_genre・note・stock_level を update できる');
select is(pg_temp.affected_rows($$ update public.item set supply_genre = 'のっとり' where id = 'b1000000-0000-4000-8000-0000000000b1' $$), 0::bigint, '分離: B の日用品の update は 0 行');
select is(pg_temp.affected_rows($$ delete from public.item where id = 'b1000000-0000-4000-8000-0000000000b1' $$), 0::bigint, '分離: B の日用品の delete は 0 行');
select is((select count(*) from public.item where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b'), 0::bigint, '分離: B の日用品は select で見えない');

-- ---- 4 使用中 ----
select throws_ok($$ delete from public.unit where name = '個' $$, '23503', null, '使用中: 数で管理の日用品が使う単位は消せない');
reset role;
insert into public.unit (id, household_id, name, sort_order) values ('a7000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', '残しただけ', 90);
update public.item set unit_id = 'a7000000-0000-4000-8000-000000000001' where id = 'a1000000-0000-4000-8000-0000000000a2';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.affected_rows($$ delete from public.unit where id = 'a7000000-0000-4000-8000-000000000001' $$), 1::bigint, '使用中: 残量の日用品に残しただけの単位は消せる');
select is((select unit_id is null from public.item where id = 'a1000000-0000-4000-8000-0000000000a2'), true, '使用中: その unit_id が null になる');

-- ---- 5 管理のしかた ----
select is(pg_temp.affected_rows($$ update public.item set tracking = 'level', stock_level = 'low', restock_at_count = null, restock_at_level = 'low' where id = 'a1000000-0000-4000-8000-0000000000a1' $$), 1::bigint, '管理のしかた: 数の日用品を残量に update できる');
select is((select count(*) from public.item_stock where item_id = 'a1000000-0000-4000-8000-0000000000a1'), 0::bigint, '管理のしかた: 0 個の在庫が消える');
select is(pg_temp.affected_rows($$ update public.item set tracking = 'count', stock_level = null, restock_at_level = null, unit_id = (select id from public.unit where name = '個') where id = 'a1000000-0000-4000-8000-0000000000a1' $$), 1::bigint, '管理のしかた: 残量 → 数に update できる');
select is(pg_temp.affected_rows($$ insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1000000-0000-4000-8000-0000000000a1', 0) $$), 1::bigint, '管理のしかた: そのあと 0 個の在庫を入れられる');

-- ---- 6 変更の知らせ ----
update public.item set supply_genre = '知らせ' where id = 'a1000000-0000-4000-8000-0000000000a2';
reset role;
select is(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'item' and event = 'UPDATE') > (select a from msg_before),
  true, '知らせ: 日用品の update が household:<A> の item の UPDATE として増える'
);
select is(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'item' and event = 'UPDATE' and payload -> 'record' ->> 'supply_genre' = '知らせ'),
  1::bigint, '知らせ: payload の record に supply_genre が入っている'
);
select is(
  (select count(*) from realtime.messages where topic = 'household:bbbbbbbb-0000-4000-8000-00000000000b' and payload ->> 'table' = 'item' and event = 'UPDATE'),
  0::bigint, '知らせ: B のチャンネルには A の変更が出ない'
);

select * from finish();
rollback;
