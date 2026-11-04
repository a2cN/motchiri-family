-- RLS の見張り: public・private の普通のテーブル・パーティションのテーブルで、RLS が有効でないものが 0 件。
-- 自己テスト: 同じ問い合わせが、RLS の無い仮のテーブルを見つけること。
begin;
select plan(3);

create function pg_temp.tables_without_rls() returns setof text language sql as $$
  select n.nspname || '.' || c.relname
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p')
    and not c.relrowsecurity
  order by 1
$$;

select is(
  (select count(*) from pg_temp.tables_without_rls()),
  0::bigint,
  'public・private に、RLS が有効でないテーブルが無い'
);

-- 自己テスト: RLS の無い仮のテーブルを作ると見つかる
create table public.guard_selftest_no_rls (id int);
select is(
  (select count(*) from pg_temp.tables_without_rls() as t(name) where name = 'public.guard_selftest_no_rls'),
  1::bigint,
  '自己テスト: RLS の無い仮のテーブルが、見張りに見つかる'
);

-- 自己テスト: RLS を有効にすると見つからなくなる(見張りが何でも拾うわけではない)
alter table public.guard_selftest_no_rls enable row level security;
select is(
  (select count(*) from pg_temp.tables_without_rls() as t(name) where name = 'public.guard_selftest_no_rls'),
  0::bigint,
  '自己テスト: RLS を有効にすると、見張りに見つからない'
);

select * from finish();
rollback;
