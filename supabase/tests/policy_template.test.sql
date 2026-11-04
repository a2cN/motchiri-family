-- 業務テーブルの型紙の確かめ(30_architecture.md Data Model)。倉庫のタスク以降の手本になる。
-- 仮の業務テーブル(household_id 付き)を型紙どおりに作り、分離が効くことを確かめる。
--   型紙: household_id を持つ / RLS を有効にする / 全部の権限を取り消してから要るものだけを authenticated に GRANT /
--         操作ごとのポリシー(select・delete は using、insert は with check、update は using と with check)。すべて to authenticated。
begin;
select plan(11);

-- 実行した文が変えた行数を返す(データを変える文は with の中に書けないため)
create function pg_temp.affected_rows(statement text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end
$$;

create table public.template_item (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.household (id),
  label text not null default ''
);
alter table public.template_item enable row level security;
revoke all on table public.template_item from public, anon, authenticated;
grant select, insert, update, delete on table public.template_item to authenticated;

create policy template_item_select on public.template_item
  for select to authenticated using (household_id in (select private.current_household_ids()));
create policy template_item_insert on public.template_item
  for insert to authenticated with check (household_id in (select private.current_household_ids()));
create policy template_item_update on public.template_item
  for update to authenticated
  using (household_id in (select private.current_household_ids()))
  with check (household_id in (select private.current_household_ids()));
create policy template_item_delete on public.template_item
  for delete to authenticated using (household_id in (select private.current_household_ids()));

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'a1@example.com'),
  ('b1000000-0000-4000-8000-000000000003', 'b1@example.com');
insert into public.household (id) values
  ('aaaaaaaa-0000-4000-8000-00000000000a'),
  ('bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.member (user_id, household_id) values
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a'),
  ('b1000000-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-00000000000b');
insert into public.template_item (id, household_id, label) values
  ('11111111-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-00000000000a', 'a の行'),
  ('22222222-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-00000000000b', 'b の行');

-- ---- A1 ----
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

select is((select count(*) from public.template_item), 1::bigint, 'A1: 自分の世帯の行だけ読める(B の行は 0 行)');
select lives_ok(
  $$ insert into public.template_item (household_id, label) values ('aaaaaaaa-0000-4000-8000-00000000000a', '新しい行') $$,
  'A1: 自分の世帯の行を書ける'
);
select throws_ok(
  $$ insert into public.template_item (household_id, label) values ('bbbbbbbb-0000-4000-8000-00000000000b', 'もぐりこみ') $$,
  '42501', null, 'A1: B の household_id では書けない(RLS の違反)'
);
select lives_ok($$ update public.template_item set label = '直した' where id = '11111111-0000-4000-8000-000000000001' $$, 'A1: 自分の行を更新できる');
select throws_ok(
  $$ update public.template_item set household_id = 'bbbbbbbb-0000-4000-8000-00000000000b' where id = '11111111-0000-4000-8000-000000000001' $$,
  '42501', null, 'A1: 行を B の世帯へ移せない(update の with check)'
);
select is(
  pg_temp.affected_rows($$ update public.template_item set label = 'のっとり' where id = '22222222-0000-4000-8000-000000000002' $$),
  0::bigint, 'A1: B の行の update は 0 行'
);
select is(
  pg_temp.affected_rows($$ delete from public.template_item where id = '22222222-0000-4000-8000-000000000002' $$),
  0::bigint, 'A1: B の行の delete は 0 行'
);
select is(
  pg_temp.affected_rows($$ delete from public.template_item where id = '11111111-0000-4000-8000-000000000001' $$),
  1::bigint, 'A1: 自分の行は delete できる'
);

-- ---- anon ----
reset role;
set local role anon;
select throws_ok($$ select * from public.template_item $$, '42501', null, 'anon: 読めない');
select throws_ok($$ insert into public.template_item (household_id) values ('aaaaaaaa-0000-4000-8000-00000000000a') $$, '42501', null, 'anon: 書けない');

-- ---- 型紙の自己確認: ポリシーが to authenticated だけ(to public のポリシーが無い) ----
reset role;
select is(
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'template_item' and roles <> '{authenticated}'),
  0::bigint, '型紙: すべてのポリシーが to authenticated だけ'
);

select * from finish();
rollback;
