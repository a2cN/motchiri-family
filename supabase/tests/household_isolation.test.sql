-- 世帯の分離: 世帯 A(利用者 A1・A2)、世帯 B(B1)、世帯に結びついていない U0。
-- anon・別の世帯・結びついていない人から、household と member が読めない・書けないことを確かめる。
-- 利用者は auth.users に直接入れる(メールは example.com の架空のもの)。このファイルのトランザクションの最後に取り消す。
begin;
select plan(17);

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'a1@example.com'),
  ('a2000000-0000-4000-8000-000000000002', 'a2@example.com'),
  ('b1000000-0000-4000-8000-000000000003', 'b1@example.com'),
  ('c0000000-0000-4000-8000-000000000004', 'u0@example.com');

insert into public.household (id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a'),
  ('bbbbbbbb-0000-4000-8000-00000000000b');

insert into public.member (user_id, household_id) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a'),
  ('a2000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-00000000000a'),
  ('b1000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b');

-- 前提: 1人は1つの世帯にだけ属する(主キーが user_id)
select throws_ok(
  $$ insert into public.member (user_id, household_id) values ('a1000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-00000000000b') $$,
  '23505',
  null,
  '1人を2つの世帯に入れられない(主キーが user_id)'
);

-- ---- anon(未ログイン) ----
set local role anon;
select throws_ok($$ select * from public.household $$, '42501', null, 'anon: household を読めない');
select throws_ok($$ select * from public.member $$, '42501', null, 'anon: member を読めない');
select throws_ok($$ insert into public.household default values $$, '42501', null, 'anon: household に書けない');
select throws_ok($$ delete from public.member $$, '42501', null, 'anon: member を消せない');

-- ---- A1 ----
reset role;
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.household), 1::bigint, 'A1: household は自分の世帯の1行だけ');
select is((select id from public.household), 'aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'A1: 見える household は世帯 A');
select is((select count(*) from public.member), 2::bigint, 'A1: member は世帯 A の2行だけ');
select is((select count(*) from public.member where user_id = 'b1000000-0000-4000-8000-000000000003'), 0::bigint, 'A1: B1 の member は見えない');
select throws_ok($$ insert into public.member (user_id, household_id) values ('c0000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-00000000000a') $$,
  '42501', null, 'A1: member に書けない(自分の世帯にも人を足せない)');
select throws_ok($$ update public.household set created_at = now() $$, '42501', null, 'A1: household を更新できない');
select throws_ok($$ delete from public.member $$, '42501', null, 'A1: member を消せない');

-- ---- B1 ----
reset role;
select set_config('request.jwt.claims', '{"sub":"b1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.household where id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 0::bigint, 'B1: 世帯 A の household は見えない');
select is((select count(*) from public.member where household_id = 'aaaaaaaa-0000-4000-8000-00000000000a'), 0::bigint, 'B1: 世帯 A の member は見えない');
select is((select count(*) from public.member), 1::bigint, 'B1: member は自分の1行だけ');

-- ---- U0(世帯に結びついていない) ----
reset role;
select set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000004","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*) from public.household), 0::bigint, 'U0: household は 0 行');
select is((select count(*) from public.member), 0::bigint, 'U0: member は 0 行');

reset role;
select * from finish();
rollback;
