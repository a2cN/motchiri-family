-- GRANT の見張り。新しいテーブルは、下の一覧に足すまで通らない。
--  (1) anon は、public・private のどのテーブル・ビュー・シーケンスにも権限を1つも持たない
--  (2) anon と全員(public)は、public・private の自分たちの関数(拡張機能のものを除く)を実行できない
--  (3) authenticated の権限は、一覧(household・member・genre・location・unit: SELECT、item: SELECT・INSERT・UPDATE、item_stock: 4つ)と完全に一致する
-- 自己テスト: 仮のテーブルへの anon の GRANT は (1) が、一覧に無い truncate は (3) が見つける。
begin;
select plan(8);

-- (1) anon の権限を持つテーブル等(grantee 0 = 全員 も数える)
create function pg_temp.anon_relation_grants() returns setof text language sql as $$
  select n.nspname || '.' || c.relname || ':' || a.privilege_type
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) as a
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    and a.grantee in ((select oid from pg_roles where rolname = 'anon'), 0)
  order by 1
$$;

-- (2) anon が実行できる関数
create function pg_temp.anon_executable_functions() returns setof text language sql as $$
  select n.nspname || '.' || p.proname
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and not exists (
      select 1 from pg_depend as d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
    -- イベントトリガーの関数(Supabase の rls_auto_enable など)は SQL・RPC から直接呼べないので除く(OD-auth-household-23 A)
    and p.prorettype <> 'event_trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE')
  order by 1
$$;

-- (3) authenticated(と全員)の、テーブルごとの権限
create function pg_temp.authenticated_grants() returns setof text language sql as $$
  select c.relname || ':' || a.privilege_type
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) as a
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    and a.grantee in ((select oid from pg_roles where rolname = 'authenticated'), 0)
  order by 1
$$;

select is((select count(*) from pg_temp.anon_relation_grants()), 0::bigint,
  '(1) anon は、public・private のどのテーブル・ビュー・シーケンスにも権限を持たない');

select is((select count(*) from pg_temp.anon_executable_functions()), 0::bigint,
  '(2) anon は、public・private の関数を1つも実行できない');

select results_eq(
  $$ select * from pg_temp.authenticated_grants() $$,
  $$ values
    ('genre:SELECT'), ('household:SELECT'),
    ('item:INSERT'), ('item:SELECT'), ('item:UPDATE'),
    ('item_stock:DELETE'), ('item_stock:INSERT'), ('item_stock:SELECT'), ('item_stock:UPDATE'),
    ('location:SELECT'), ('member:SELECT'), ('unit:SELECT') $$,
  '(3) authenticated の権限が、一覧(genre・location・unit・household・member: SELECT、item: SELECT・INSERT・UPDATE、item_stock: SELECT・INSERT・UPDATE・DELETE)と完全に一致する'
);

-- authenticated が private スキーマと関数を使える(ポリシーが呼べる)
select ok(has_schema_privilege('authenticated', 'private', 'USAGE'), 'authenticated は private スキーマを使える');
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon は private スキーマを使えない');

-- 自己テスト: 仮のテーブルを anon に GRANT すると (1) が見つける
create table public.guard_selftest (id int);
alter table public.guard_selftest enable row level security;
revoke all on table public.guard_selftest from public, anon, authenticated;
grant select on table public.guard_selftest to anon;
select is(
  (select count(*) from pg_temp.anon_relation_grants() as t(x) where x = 'public.guard_selftest:SELECT'),
  1::bigint,
  '自己テスト: anon への GRANT が、見張り (1) に見つかる'
);

-- 自己テスト: 一覧に無い truncate を authenticated に GRANT すると (3) が見つける
grant truncate on table public.guard_selftest to authenticated;
select is(
  (select count(*) from pg_temp.authenticated_grants() as t(x) where x = 'guard_selftest:TRUNCATE'),
  1::bigint,
  '自己テスト: 一覧に無い権限が、見張り (3) に見つかる'
);

-- 自己テスト: 関数を public のまま作ると (2) が見つける(public の関数は既定で全員が実行できる)
create function public.guard_selftest_fn() returns int language sql as $$ select 1 $$;
select is(
  (select count(*) from pg_temp.anon_executable_functions() as t(x) where x = 'public.guard_selftest_fn'),
  1::bigint,
  '自己テスト: 実行を絞っていない関数が、見張り (2) に見つかる'
);

select * from finish();
rollback;
