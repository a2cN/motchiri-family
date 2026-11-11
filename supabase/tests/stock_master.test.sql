-- 倉庫 run 2(stock-master)の確かめ(30_architecture.md Interfaces §9)。
--  1 分離(マスタ・品物の書き込み) / 2 世帯をまたぐ参照 / 3 使用中(固い参照) / 4 やわらかい参照の解放 / 5 管理のしかた
--  6 品物の削除 / 7 世帯の削除 / 8 変更の知らせ / 9 自己テスト
-- 世帯 A に A1、世帯 B に B1、世帯に結びついていない U0。メールは example.com の架空のもの。最後に rollback。
begin;
select plan(45);

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
  ('b1000000-0000-4000-8000-000000000003', 'b1@example.com'),
  ('c0000000-0000-4000-8000-000000000000', 'u0@example.com');
insert into public.household (id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a'),
  ('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.member (user_id, household_id) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a'),
  ('b1000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b');

-- 準備(postgres)
-- 牛乳: 数で管理、ジャンル 卵・乳製品、単位 個、場所 冷蔵庫、在庫2件(冷蔵庫・棚)
-- しょうゆ: 残量で管理、場所 棚(固い)、単位 本 を残している(やわらかい)
insert into public.item (id, household_id, name, item_kind, tracking, genre_id, unit_id, location_id) values
  ('a1111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', '牛乳', 'food', 'count',
    (select id from public.genre where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '卵・乳製品'),
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個'),
    (select id from public.location where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '冷蔵庫')),
  ('b2222222-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-00000000000b', 'B牛乳', 'food', 'count',
    (select id from public.genre where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and name = '卵・乳製品'),
    (select id from public.unit where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and name = '個'),
    (select id from public.location where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and name = '冷蔵庫'));
insert into public.item (id, household_id, name, item_kind, tracking, genre_id, unit_id, location_id, stock_level, restock_at_level) values
  ('a5555555-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-00000000000a', 'しょうゆ', 'food', 'level',
    (select id from public.genre where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '調味料'),
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '本'),
    (select id from public.location where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '棚'),
    'full', 'low');
insert into public.item_stock (id, household_id, item_id, quantity, location_id) values
  ('a3333333-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'a1111111-0000-4000-8000-000000000001', 2,
    (select id from public.location where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '冷蔵庫')),
  ('a3333333-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a', 'a1111111-0000-4000-8000-000000000001', 1,
    (select id from public.location where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '棚'));
-- 場所・単位の削除の確かめ用(A)と、B の同じ形の行
insert into public.location (id, household_id, name, sort_order) values
  ('a6000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', '使い道なし', 90),
  ('a6000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a', '既定だけ', 91),
  ('b6000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b', '既定だけ', 91);
insert into public.unit (id, household_id, name, sort_order) values
  ('a7000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', '残しただけ', 90);
update public.genre set default_location_id = 'a6000000-0000-4000-8000-000000000002'
  where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = 'お菓子';
update public.genre set default_location_id = 'b6000000-0000-4000-8000-000000000001'
  where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and name = 'お菓子';
insert into public.item (id, household_id, name, item_kind, tracking, genre_id, unit_id, location_id) values
  ('a8000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'あめ', 'food', 'count',
    (select id from public.genre where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = 'お菓子'),
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '袋'),
    'a6000000-0000-4000-8000-000000000002');
update public.item set unit_id = 'a7000000-0000-4000-8000-000000000001' where id = 'a5555555-0000-4000-8000-000000000005';

create temp table msg_before as
  select (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a') as a;
grant select on pg_temp.msg_before to public;

-- ---- 1 分離: A1 ----
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is(pg_temp.affected_rows($$ insert into public.genre (household_id, name, sort_order) values ('aaaaaaaa-0000-4000-8000-00000000000a', '新ジャンル', 99) $$), 1::bigint, 'A1: 自分の世帯にジャンルを足せる');
select is(pg_temp.affected_rows($$ insert into public.location (household_id, name, sort_order) values ('aaaaaaaa-0000-4000-8000-00000000000a', '新場所', 99) $$), 1::bigint, 'A1: 自分の世帯に場所を足せる');
select is(pg_temp.affected_rows($$ insert into public.unit (household_id, name, sort_order) values ('aaaaaaaa-0000-4000-8000-00000000000a', '新単位', 99) $$), 1::bigint, 'A1: 自分の世帯に単位を足せる');
select is(pg_temp.affected_rows($$ update public.genre set name = '改名ジャンル' where name = '新ジャンル' $$), 1::bigint, 'A1: 自分のジャンルの名前を変えられる');
select is(pg_temp.affected_rows($$ update public.location set name = '改名場所' where name = '新場所' $$), 1::bigint, 'A1: 自分の場所の名前を変えられる');
select is(pg_temp.affected_rows($$ update public.unit set name = '改名単位', is_countable = false where name = '新単位' $$), 1::bigint, 'A1: 自分の単位を変えられる');
select is(pg_temp.affected_rows($$ delete from public.genre where name = '改名ジャンル' $$), 1::bigint, 'A1: 使っていないジャンルを消せる');
select is(pg_temp.affected_rows($$ delete from public.location where name = '改名場所' $$), 1::bigint, 'A1: 使っていない場所を消せる');
select is(pg_temp.affected_rows($$ delete from public.unit where name = '改名単位' $$), 1::bigint, 'A1: 使っていない単位を消せる');
select throws_ok($$ insert into public.genre (household_id, name, sort_order) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'もぐりこみ', 99) $$, '42501', null, 'A1: 世帯 B の household_id でジャンルを足せない(RLS)');
select throws_ok($$ insert into public.location (household_id, name, sort_order) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'もぐりこみ', 99) $$, '42501', null, 'A1: 世帯 B の household_id で場所を足せない(RLS)');
select throws_ok($$ insert into public.unit (household_id, name, sort_order) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'もぐりこみ', 99) $$, '42501', null, 'A1: 世帯 B の household_id で単位を足せない(RLS)');
select is(pg_temp.affected_rows($$ update public.genre set name = 'のっとり' where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' $$), 0::bigint, 'A1: B のジャンルの update は 0 行');
select is(pg_temp.affected_rows($$ delete from public.location where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' $$), 0::bigint, 'A1: B の場所の delete は 0 行');
select is(pg_temp.affected_rows($$ delete from public.unit where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' $$), 0::bigint, 'A1: B の単位の delete は 0 行');
select is(pg_temp.affected_rows($$ delete from public.item where id = 'b2222222-0000-4000-8000-000000000002' $$), 0::bigint, 'A1: B の品物の delete は 0 行');

-- ---- 2 世帯をまたぐ参照 ----
select throws_ok(
  $$ update public.genre set default_location_id = 'b6000000-0000-4000-8000-000000000001' where name = 'お肉の別名' or name = '肉' $$,
  '23503', null, '参照: 自分のジャンルの既定の場所に B の場所を入れられない(外部キー)'
);

-- ---- 3 使用中(固い参照)は消せない ----
select throws_ok($$ delete from public.genre where name = '卵・乳製品' $$, '23503', null, '使用中: 食材の品物が使うジャンルは消せない');
select throws_ok($$ delete from public.location where name = '棚' $$, '23503', null, '使用中: 在庫が使う場所は消せない');
select is(
  (select count(*) from public.genre where default_location_id = (select id from public.location where name = '棚')),
  4::bigint, '使用中: 消せなかった場所(棚)を既定にしているジャンル(主食・調味料・飲み物・その他)は、trigger の更新も含めて取り消されて変わらない'
);
select throws_ok($$ delete from public.unit where name = '個' $$, '23503', null, '使用中: 数で管理の品物が使う単位は消せない');
update public.item set location_id = 'a6000000-0000-4000-8000-000000000001' where id = 'a5555555-0000-4000-8000-000000000005';
select throws_ok($$ delete from public.location where id = 'a6000000-0000-4000-8000-000000000001' $$, '23503', null, '使用中: 残量で管理の品物の場所は消せない');
update public.item set location_id = (select id from public.location where name = '棚') where id = 'a5555555-0000-4000-8000-000000000005';

-- ---- 4 やわらかい参照の解放 ----
select is(pg_temp.affected_rows($$ delete from public.location where id = 'a6000000-0000-4000-8000-000000000002' $$), 1::bigint, '解放: ジャンルの既定と数で管理の前回の場所だけが指す場所は消せる');
select is(
  (select default_location_id is null from public.genre where name = 'お菓子'), true, '解放: そのジャンルの既定の場所が null になる'
);
select is(
  (select location_id is null from public.item where id = 'a8000000-0000-4000-8000-000000000001'), true, '解放: 数で管理の品物の前回の場所が null になる'
);
select is(pg_temp.affected_rows($$ delete from public.unit where id = 'a7000000-0000-4000-8000-000000000001' $$), 1::bigint, '解放: 残量で管理の品物に残しただけの単位は消せる');
select is(
  (select unit_id is null from public.item where id = 'a5555555-0000-4000-8000-000000000005'), true, '解放: 残量で管理の品物の単位が null になる'
);

-- ---- 5 管理のしかた ----
select is(
  pg_temp.affected_rows($$ update public.item set tracking = 'level', stock_level = 'low', restock_at_count = null, restock_at_level = 'low' where id = 'a1111111-0000-4000-8000-000000000001' $$),
  1::bigint, '管理のしかた: 数 → 残量に update できる'
);
select is((select count(*) from public.item_stock where item_id = 'a1111111-0000-4000-8000-000000000001'), 0::bigint, '管理のしかた: 同じ文で、在庫2件が 0 件になる');
select throws_ok(
  $$ insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1111111-0000-4000-8000-000000000001', 1) $$,
  '23514', null, '管理のしかた: 残量で管理の品物に在庫を入れられない'
);
select is(
  pg_temp.affected_rows($$ update public.item set tracking = 'count', stock_level = null, restock_at_level = null, unit_id = (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個') where id = 'a1111111-0000-4000-8000-000000000001' $$),
  1::bigint, '管理のしかた: 残量 → 数に update できる'
);
select is(
  pg_temp.affected_rows($$ insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1111111-0000-4000-8000-000000000001', 3) $$),
  1::bigint, '管理のしかた: 数に戻したあとは在庫を入れられる'
);
select throws_ok(
  $$ update public.item_stock set item_id = 'a5555555-0000-4000-8000-000000000005' where item_id = 'a1111111-0000-4000-8000-000000000001' $$,
  '23514', null, '管理のしかた: 在庫の品物を残量で管理の品物に付け替えられない'
);
select is(
  pg_temp.affected_rows($$
    with i as (
      insert into public.item (id, household_id, name, item_kind, tracking, genre_id, unit_id)
      values ('a9000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'WITH で入れた品', 'food', 'count',
        (select id from public.genre where name = '肉'), (select id from public.unit where name = '個'))
      returning id, household_id
    )
    insert into public.item_stock (household_id, item_id, quantity) select household_id, id, 1 from i
  $$),
  1::bigint, '管理のしかた: 1つの文の WITH で、数で管理の品物と在庫を一緒に入れられる(seedStock の形)'
);

-- ---- 6 品物の削除 ----
select is(pg_temp.affected_rows($$ delete from public.item where id = 'a1111111-0000-4000-8000-000000000001' $$), 1::bigint, '削除: 自分の品物を消せる');
select is((select count(*) from public.item_stock where item_id = 'a1111111-0000-4000-8000-000000000001'), 0::bigint, '削除: 在庫も cascade で消える');

-- ---- U0・anon ----
reset role;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000000","role":"authenticated"}', true);
set local role authenticated;
select is(pg_temp.affected_rows($$ delete from public.genre $$) + pg_temp.affected_rows($$ delete from public.item $$), 0::bigint, 'U0: マスタも品物も delete は 0 行');
reset role;
set local role anon;
select throws_ok($$ insert into public.genre (household_id, name, sort_order) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'anon', 99) $$, '42501', null, 'anon: マスタに書けない');
select throws_ok($$ delete from public.item $$, '42501', null, 'anon: 品物を消せない');
reset role;

-- ---- 7 世帯の削除 ----
insert into public.household (id) values ('dddddddd-0000-4000-8000-00000000000d');
insert into public.unit (id, household_id, name, sort_order) values ('d7000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-00000000000d', '残しただけ', 90);
insert into public.item (id, household_id, name, item_kind, tracking, genre_id, unit_id, location_id) values
  ('d1000000-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-00000000000d', 'D品', 'food', 'count',
    (select id from public.genre where household_id = 'dddddddd-0000-4000-8000-00000000000d' and name = '肉'),
    (select id from public.unit where household_id = 'dddddddd-0000-4000-8000-00000000000d' and name = '個'),
    (select id from public.location where household_id = 'dddddddd-0000-4000-8000-00000000000d' and name = '棚'));
insert into public.item (id, household_id, name, item_kind, tracking, genre_id, unit_id, location_id, stock_level) values
  ('d2000000-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-00000000000d', 'D残量', 'food', 'level',
    (select id from public.genre where household_id = 'dddddddd-0000-4000-8000-00000000000d' and name = '肉'),
    'd7000000-0000-4000-8000-000000000001',
    (select id from public.location where household_id = 'dddddddd-0000-4000-8000-00000000000d' and name = '冷蔵庫'), 'full');
insert into public.item_stock (household_id, item_id, quantity, location_id) values
  ('dddddddd-0000-4000-8000-00000000000d', 'd1000000-0000-4000-8000-000000000001', 1,
    (select id from public.location where household_id = 'dddddddd-0000-4000-8000-00000000000d' and name = '棚'));
select lives_ok($$ delete from public.household where id = 'dddddddd-0000-4000-8000-00000000000d' $$, '世帯の削除: 既定の場所・前回の場所・在庫・残した単位がそろった世帯を消せる(cascade で trigger の守りが働く)');
select is((select count(*) from public.genre where household_id = 'dddddddd-0000-4000-8000-00000000000d'), 0::bigint, '世帯の削除: マスタも消える');

-- ---- 8 変更の知らせ ----
-- ここまでの A の知らせを数えなおす
create temp table msg_mid as
  select
    (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'location' and event = 'DELETE') as loc_del,
    (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'genre' and event = 'UPDATE') as genre_upd,
    (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'item_stock' and event = 'DELETE') as stock_del;
insert into public.location (id, household_id, name, sort_order) values ('a6000000-0000-4000-8000-000000000009', 'aaaaaaaa-0000-4000-8000-00000000000a', '知らせ用', 95);
update public.genre set default_location_id = 'a6000000-0000-4000-8000-000000000009' where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '魚';
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
delete from public.location where id = 'a6000000-0000-4000-8000-000000000009';
reset role;
select is(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'location' and event = 'DELETE') - (select loc_del from msg_mid),
  1::bigint, '知らせ: 場所を消すと、topic household:<A> に location の DELETE が増える'
);
select is(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'genre' and event = 'UPDATE') - (select genre_upd from msg_mid),
  2::bigint, '知らせ: 空にされた genre の UPDATE も届く(準備の update の1つと、trigger の更新の1つ)'
);
insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a9000000-0000-4000-8000-000000000001', 4);
update public.item set tracking = 'level', stock_level = 'full', restock_at_level = 'low' where id = 'a9000000-0000-4000-8000-000000000001';
select is(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and payload ->> 'table' = 'item_stock' and event = 'DELETE') - (select stock_del from msg_mid),
  2::bigint, '知らせ: 数 → 残量で、trigger が消した在庫ごとの item_stock の DELETE が届く(WITH で入れた1件と追加の1件)'
);

-- ---- 9 自己テスト: 固い参照を外すと同じ削除が通る ----
update public.item set unit_id = (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '袋') where id = 'a8000000-0000-4000-8000-000000000001';
delete from public.item where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and tracking = 'count' and unit_id = (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個');
select is(
  pg_temp.affected_rows($$ delete from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個' $$),
  1::bigint, '自己テスト: 固い参照(数で管理の品物)を外すと、同じ単位の削除が通る(使用中の止まりは、固い参照があるときだけ)'
);

select * from finish();
rollback;
