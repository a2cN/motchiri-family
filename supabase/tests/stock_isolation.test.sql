-- 倉庫のテーブル5つ(genre・location・unit・item・item_stock)の確かめ(30_architecture.md Interfaces §9)。
--  1 初期マスタ / 2 世帯の分離 / 3 世帯をまたぐ参照 / 4 制約 / 5 更新時刻 / 6 変更の知らせ / 7 チャンネルの読み取りの分離 / 8 自己テスト
-- 世帯 A に A1・A2、世帯 B に B1、世帯に結びついていない U0。メールは example.com の架空のもの。
begin;
select plan(55);

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
  ('a2000000-0000-4000-8000-000000000002', 'a2@example.com'),
  ('b1000000-0000-4000-8000-000000000003', 'b1@example.com'),
  ('c0000000-0000-4000-8000-000000000000', 'u0@example.com');
-- household を insert すると、trigger が初期マスタを入れる
insert into public.household (id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a'),
  ('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.member (user_id, household_id) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a'),
  ('a2000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a'),
  ('b1000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b');

-- ---- 1 初期マスタ(要件定義 §7) ----
select is((select count(*) from public.genre where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 10::bigint, '初期マスタ: ジャンル 10');
select is((select count(*) from public.location where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 4::bigint, '初期マスタ: 場所 4');
select is((select count(*) from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 7::bigint, '初期マスタ: 単位 7');
select results_eq(
  $$ select name from public.location where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' order by sort_order $$,
  $$ values ('冷蔵庫'), ('冷凍庫'), ('野菜室'), ('棚') $$,
  '初期マスタ: 場所の名前が、この順(sort_order)'
);
select results_eq(
  $$ select g.name, l.name from public.genre as g join public.location as l on l.household_id = g.household_id and l.id = g.default_location_id
     where g.household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' order by g.sort_order $$,
  $$ values ('野菜・果物', '冷蔵庫'), ('肉', '冷蔵庫'), ('魚', '冷蔵庫'), ('卵・乳製品', '冷蔵庫'), ('冷凍食品', '冷凍庫'),
            ('主食(米・パン・麺)', '棚'), ('調味料', '棚'), ('飲み物', '棚'), ('お菓子', '棚'), ('その他', '棚') $$,
  '初期マスタ: ジャンルの順と既定の場所'
);
select results_eq(
  $$ select name, is_countable from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' order by sort_order $$,
  $$ values ('個', true), ('本', true), ('パック', true), ('袋', true), ('枚', true), ('g', false), ('ml', false) $$,
  '初期マスタ: 単位の順と is_countable(g・ml は ± で数えない)'
);
select private.seed_household_masters('aaaaaaaa-0000-4000-8000-00000000000a');
select is(
  (select count(*) from public.genre where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
  + (select count(*) from public.location where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a')
  + (select count(*) from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  21::bigint, '初期マスタ: seed_household_masters を2回呼んでも件数が変わらない'
);

-- 2 の準備(postgres で入れる)。A1 は A の行、B1 は B の行
insert into public.item (id, household_id, name, item_kind, tracking, genre_id, unit_id) values
  ('a1111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'テスト品A', 'food', 'count',
    (select id from public.genre where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '肉'),
    (select id from public.unit where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a' and name = '個')),
  ('b2222222-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-00000000000b', 'テスト品B', 'food', 'count',
    (select id from public.genre where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and name = '肉'),
    (select id from public.unit where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' and name = '個'));

-- 6 の準備: 知らせの数を数えておく(postgres で)
create temp table msg_before as
  select
    (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a') as a,
    (select count(*) from realtime.messages where topic = 'household:bbbbbbbb-0000-4000-8000-00000000000b') as b;
grant select on pg_temp.msg_before to public;
create temp table b_location as select id from public.location where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' limit 1;
grant select on pg_temp.b_location to public;

insert into public.item_stock (id, household_id, item_id, quantity) values
  ('a3333333-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-00000000000a', 'a1111111-0000-4000-8000-000000000001', 2),
  ('b4444444-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-00000000000b', 'b2222222-0000-4000-8000-000000000002', 5);

-- ---- 6 変更の知らせ(postgres のまま: insert の直後) ----
select is(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a') - (select a from msg_before),
  1::bigint, '知らせ: A の item_stock の insert で、topic household:<A> の行が1つ増える'
);
select is(
  (select count(*) from realtime.messages where topic = 'household:bbbbbbbb-0000-4000-8000-00000000000b') - (select b from msg_before),
  1::bigint, '知らせ: B の item_stock の insert で、topic household:<B> の行が1つ増える(A の topic には増えない)'
);
update public.item_stock set quantity = 3 where id = 'a3333333-0000-4000-8000-000000000003';
select is(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and event = 'UPDATE'),
  1::bigint, '知らせ: update で、イベント名 UPDATE の行が増える'
);
select is(
  (select payload -> 'old_record' ->> 'quantity' from realtime.messages
    where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a' and event = 'UPDATE' limit 1),
  '2.0', '知らせ: update の知らせに、前の行の全列(old_record)が入る'
);

-- ---- 2 分離: A1 ----
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.genre), 10::bigint, 'A1: ジャンルは世帯 A の 10 件だけ');
select is((select count(*) from public.location), 4::bigint, 'A1: 場所は世帯 A の 4 件だけ');
select is((select count(*) from public.unit), 7::bigint, 'A1: 単位は世帯 A の 7 件だけ');
select results_eq($$ select name from public.item $$, $$ values ('テスト品A') $$, 'A1: 品物は世帯 A のものだけ');
select results_eq($$ select id::text from public.item_stock $$, $$ values ('a3333333-0000-4000-8000-000000000003') $$, 'A1: 在庫は世帯 A のものだけ');
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, genre_id, unit_id) values
     ('bbbbbbbb-0000-4000-8000-00000000000b', 'もぐりこみ', 'food', 'count',
      (select id from public.genre where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' limit 1),
      (select id from public.unit where household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' limit 1)) $$,
  '42501', null, 'A1: 世帯 B の household_id で品物を作れない(RLS)'
);
select throws_ok(
  $$ insert into public.item_stock (household_id, item_id, quantity) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'b2222222-0000-4000-8000-000000000002', 1) $$,
  '42501', null, 'A1: 世帯 B の household_id で在庫を作れない(RLS)'
);
select is(pg_temp.affected_rows($$ update public.item set name = 'のっとり' where id = 'b2222222-0000-4000-8000-000000000002' $$), 0::bigint, 'A1: B の品物の update は 0 行');
select is(pg_temp.affected_rows($$ update public.item_stock set quantity = 99 where id = 'b4444444-0000-4000-8000-000000000004' $$), 0::bigint, 'A1: B の在庫の update は 0 行');
select is(pg_temp.affected_rows($$ delete from public.item_stock where id = 'b4444444-0000-4000-8000-000000000004' $$), 0::bigint, 'A1: B の在庫の delete は 0 行');
-- run 2 でマスタの書き込みと品物の削除の権限を足した(書き込みの分離の本体は stock_master.test.sql)。ここでは世帯をまたぐ書き込みが止まることだけ確かめる
select throws_ok($$ insert into public.genre (household_id, name, sort_order) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'あたらしい', 11) $$, '42501', null, 'A1: 世帯 B のマスタ(genre)は書けない(RLS)');
select is(pg_temp.affected_rows($$ delete from public.item where id = 'b2222222-0000-4000-8000-000000000002' $$), 0::bigint, 'A1: B の品物は削除できない(0 行)');

-- ---- 3 世帯をまたぐ参照 ----
select throws_ok(
  $$ insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'b2222222-0000-4000-8000-000000000002', 1) $$,
  '23503', null, 'A1: 自分の世帯の在庫に B の品物を指せない(外部キー)'
);
select throws_ok(
  $$ insert into public.item_stock (household_id, item_id, quantity, location_id) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1111111-0000-4000-8000-000000000001', 1,
     (select id from pg_temp.b_location)) $$,
  '23503', null, 'A1: 自分の世帯の在庫に B の場所を指せない(外部キー)'
);

-- ---- 4 制約(A1 として) ----
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, unit_id) values
     ('aaaaaaaa-0000-4000-8000-00000000000a', 'ジャンル無し', 'food', 'count', (select id from public.unit limit 1)) $$,
  '23514', null, '制約: 食材でジャンルが無いと失敗'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, genre_id) values
     ('aaaaaaaa-0000-4000-8000-00000000000a', '単位無し', 'food', 'count', (select id from public.genre limit 1)) $$,
  '23514', null, '制約: 数で管理で単位が無いと失敗'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, genre_id) values
     ('aaaaaaaa-0000-4000-8000-00000000000a', '残量無し', 'food', 'level', (select id from public.genre limit 1)) $$,
  '23514', null, '制約: 残量で管理で stock_level が無いと失敗'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, genre_id, unit_id, stock_level) values
     ('aaaaaaaa-0000-4000-8000-00000000000a', '食い違い', 'food', 'count', (select id from public.genre limit 1), (select id from public.unit limit 1), 'full') $$,
  '23514', null, '制約: 数で管理なのに stock_level があると失敗'
);
select lives_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, genre_id, stock_level, restock_at_level) values
     ('aaaaaaaa-0000-4000-8000-00000000000a', '残量の品', 'food', 'level', (select id from public.genre limit 1), 'full', 'low') $$,
  '制約: 残量で管理の品物を作れる'
);
select throws_ok(
  $$ insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1111111-0000-4000-8000-000000000001', -1) $$,
  '23514', null, '制約: 負の数は失敗'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, genre_id, unit_id) values
     ('aaaaaaaa-0000-4000-8000-00000000000a', 'テスト品A', 'food', 'count', (select id from public.genre limit 1), (select id from public.unit limit 1)) $$,
  '23505', null, '制約: 同じ品物名は失敗(世帯で1つ)'
);
select throws_ok(
  $$ insert into public.item (household_id, name, item_kind, tracking, genre_id, unit_id) values
     ('aaaaaaaa-0000-4000-8000-00000000000a', ' 空白つき ', 'food', 'count', (select id from public.genre limit 1), (select id from public.unit limit 1)) $$,
  '23514', null, '制約: 前後に空白のある名前は失敗'
);

-- ---- 5 更新時刻 ----
update public.item_stock set quantity = 4, updated_at = '2000-01-01T00:00:00Z' where id = 'a3333333-0000-4000-8000-000000000003';
select is((select updated_at = now() from public.item_stock where id = 'a3333333-0000-4000-8000-000000000003'), true, '更新時刻: 過去の値を送っても、サーバーの時刻になる');
select is((select purchased_on = (now() at time zone 'Asia/Tokyo')::date from public.item_stock where id = 'a3333333-0000-4000-8000-000000000003'), true, '購入日の既定は日本時間の今日');

-- ---- 7 チャンネルの読み取り(A1) ----
select set_config('realtime.topic', 'household:aaaaaaaa-0000-4000-8000-00000000000a', true);
select ok((select count(*) from realtime.messages) > 0, 'チャンネル: topic を household:<A> にした A1 は、知らせを読める');
select set_config('realtime.topic', 'household:bbbbbbbb-0000-4000-8000-00000000000b', true);
select is((select count(*) from realtime.messages), 0::bigint, 'チャンネル: topic を household:<B> にした A1 は 0 行(読めない)');
select set_config('realtime.topic', 'household:aaaaaaaa-0000-4000-8000-00000000000a', true);
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload, event, private) values ('household:aaaaaaaa-0000-4000-8000-00000000000a', 'broadcast', '{}'::jsonb, 'INSERT', true) $$,
  '42501', null, 'チャンネル: A1 は realtime.messages に書けない(ポリシーが無い)'
);

-- ---- A2(同じ世帯の2人目)は A1 と同じものが見える ----
select set_config('request.jwt.claims', '{"sub":"a2000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.item_stock), 1::bigint, 'A2: 同じ世帯の在庫が見える');

-- ---- B1 ----
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.item), 1::bigint, 'B1: 品物は世帯 B の 1 件だけ');
select results_eq($$ select id::text from public.item_stock $$, $$ values ('b4444444-0000-4000-8000-000000000004') $$, 'B1: 在庫は世帯 B のものだけ');
select is(pg_temp.affected_rows($$ update public.item_stock set quantity = 99 where id = 'a3333333-0000-4000-8000-000000000003' $$), 0::bigint, 'B1: A の在庫の update は 0 行');
select is(pg_temp.affected_rows($$ delete from public.item_stock where id = 'a3333333-0000-4000-8000-000000000003' $$), 0::bigint, 'B1: A の在庫の delete は 0 行');
select throws_ok(
  $$ insert into public.item_stock (household_id, item_id, quantity) values ('aaaaaaaa-0000-4000-8000-00000000000a', 'a1111111-0000-4000-8000-000000000001', 1) $$,
  '42501', null, 'B1: A の household_id で在庫を作れない(RLS)'
);

-- ---- U0(世帯に結びついていない) ----
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000000","role":"authenticated"}', true);
select is(
  (select count(*) from public.genre) + (select count(*) from public.location) + (select count(*) from public.unit)
  + (select count(*) from public.item) + (select count(*) from public.item_stock),
  0::bigint, 'U0: 5つのテーブルのどれも 0 行'
);
select set_config('realtime.topic', 'household:aaaaaaaa-0000-4000-8000-00000000000a', true);
select is((select count(*) from realtime.messages), 0::bigint, 'U0: チャンネルの知らせも 0 行');

-- ---- anon ----
reset role;
set local role anon;
select throws_ok($$ select * from public.item $$, '42501', null, 'anon: item を読めない');
select throws_ok($$ select * from public.item_stock $$, '42501', null, 'anon: item_stock を読めない');
select throws_ok($$ select * from public.genre $$, '42501', null, 'anon: genre を読めない');
select set_config('realtime.topic', 'household:aaaaaaaa-0000-4000-8000-00000000000a', true);
select is((select count(*) from realtime.messages), 0::bigint, 'anon: チャンネルの知らせを読めない(0 行)');
select throws_ok(
  $$ insert into realtime.messages (topic, extension, payload, event, private) values ('household:aaaaaaaa-0000-4000-8000-00000000000a', 'broadcast', '{}'::jsonb, 'INSERT', true) $$,
  '42501', null, 'anon: realtime.messages に書けない'
);

-- ---- 8 自己テスト: 0 行が「何も無いから 0」ではないこと ----
reset role;
select ok(
  (select count(*) from realtime.messages where topic = 'household:aaaaaaaa-0000-4000-8000-00000000000a') > 0
  and (select count(*) from realtime.messages where topic = 'household:bbbbbbbb-0000-4000-8000-00000000000b') > 0,
  '自己テスト: 両方の世帯の topic の知らせが実際に存在する(上の 0 行は「無いから」ではない)'
);
select is(
  (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages' and cmd <> 'SELECT'),
  0::bigint, '自己テスト: realtime.messages に SELECT 以外のポリシーが無い(INSERT・UPDATE のポリシーを作らない)'
);
select is(
  (select count(*) from pg_policies where schemaname = 'realtime' and tablename = 'messages' and roles <> '{authenticated}'),
  0::bigint, '自己テスト: realtime.messages のポリシーはすべて to authenticated だけ(anon にも public にも無い)'
);
select is(
  (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('genre', 'location', 'unit', 'item', 'item_stock') and not t.tgisinternal and t.tgname like '%broadcast'),
  5::bigint, '自己テスト: 5つのテーブルすべてに、変更の知らせの trigger がある'
);

select * from finish();
rollback;
