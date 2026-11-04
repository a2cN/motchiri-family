-- 本番(または使い捨ての環境)の状態を確かめる SQL。SQL Editor に貼って1回実行し、出た表をそのままチャットに貼る。
-- 出すのは、check(短い名前)・ok(真偽)・detail(件数・版・権限の文字列だけ)。
-- 出さないもの: auth.users の id・email・phone・raw_user_meta_data、member の user_id。
-- 読み方: ok が false の行があれば、その行の detail を伝える。結びつけの前後で期待が変わる行は、行の名前に書いてある。
-- migration を足したら、確かめる行をここに足す(30_architecture.md Interfaces §1 の 8)。
with
-- Data API の役割
roles as (
  select
    (select oid from pg_roles where rolname = 'anon') as anon,
    (select oid from pg_roles where rolname = 'authenticated') as authed
),
-- public・private の普通のテーブル・パーティションのテーブル
tbl as (
  select c.oid, n.nspname, c.relname, c.relrowsecurity, c.relacl
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p')
),
-- 拡張機能のものではない、public・private の関数
fn as (
  select p.oid, n.nspname, p.proname, p.prosecdef, p.proacl
  from pg_proc as p
  join pg_namespace as n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and not exists (
      select 1 from pg_depend as d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
),
-- anon(または全員 = grantee 0)に与えられている、表・ビュー・シーケンスの権限
anon_rel_grants as (
  select c.oid
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace,
  roles,
  lateral aclexplode(c.relacl) as a
  where n.nspname in ('public', 'private')
    and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
    and a.grantee in (roles.anon, 0)
),
anon_fn_exec as (
  select fn.oid from fn where has_function_privilege('anon', fn.oid, 'EXECUTE')
),
-- authenticated(または全員)の、テーブルごとの権限の一覧
authed_privs as (
  select
    t.relname,
    string_agg(distinct a.privilege_type, ',' order by a.privilege_type) as privs
  from tbl as t, roles,
  lateral aclexplode(t.relacl) as a
  where t.nspname = 'public' and a.grantee in (roles.authed, 0)
  group by t.relname
),
fn_check as (
  select * from fn where nspname = 'private' and proname = 'current_household_ids'
)
select "check", ok, detail from (
  select 1 as n, 'Postgres の主版が 17(config.toml の major_version)' as "check",
    (current_setting('server_version_num')::int / 10000) = 17 as ok,
    current_setting('server_version') as detail
  union all
  select 2, 'household と member がある',
    to_regclass('public.household') is not null and to_regclass('public.member') is not null,
    (to_regclass('public.household') is not null)::text || ' / ' || (to_regclass('public.member') is not null)::text
  union all
  select 3, 'public・private で RLS の無いテーブルが 0 件',
    (select count(*) from tbl where not relrowsecurity) = 0,
    (select count(*) from tbl where not relrowsecurity)::text || ' 件(テーブル ' || (select count(*) from tbl)::text || ' 件中)'
  union all
  select 4, 'anon が権限を持つテーブル・関数が 0 件',
    (select count(*) from anon_rel_grants) = 0 and (select count(*) from anon_fn_exec) = 0,
    'テーブル等 ' || (select count(*) from anon_rel_grants)::text || ' 件 / 関数 ' || (select count(*) from anon_fn_exec)::text || ' 件'
  union all
  select 5, 'authenticated の権限が household: SELECT・member: SELECT だけ',
    coalesce((select string_agg(relname || ':' || privs, ' / ' order by relname) from authed_privs), '')
      = 'household:SELECT / member:SELECT',
    coalesce((select string_agg(relname || ':' || privs, ' / ' order by relname) from authed_privs), '(なし)')
  union all
  select 6, 'ポリシーの数(household 1・member 1)',
    (select count(*) from pg_policies where schemaname = 'public' and tablename = 'household') = 1
      and (select count(*) from pg_policies where schemaname = 'public' and tablename = 'member') = 1,
    'household ' || (select count(*) from pg_policies where schemaname = 'public' and tablename = 'household')::text
      || ' / member ' || (select count(*) from pg_policies where schemaname = 'public' and tablename = 'member')::text
  union all
  select 7, 'private.current_household_ids が security definer で、anon・全員が実行できない',
    coalesce((select prosecdef and proacl is not null
      and not exists (select 1 from roles, aclexplode(proacl) as a where a.grantee in (roles.anon, 0))
      from fn_check), false),
    coalesce((select 'security definer=' || prosecdef::text || ' / anon 実行=' || has_function_privilege('anon', oid, 'EXECUTE')::text from fn_check), '関数なし')
  union all
  select 8, 'auth.users の数と、うちメール確認済み(期待: 2 と 2)',
    (select count(*) from auth.users) = 2 and (select count(email_confirmed_at) from auth.users) = 2,
    (select count(*) from auth.users)::text || ' / ' || (select count(email_confirmed_at) from auth.users)::text
  union all
  select 9, '世帯の数(結びつけの前 0・後 1)',
    (select count(*) from public.household) in (0, 1),
    (select count(*) from public.household)::text
  union all
  select 10, 'メンバーの数(前 0・後 2)',
    (select count(*) from public.member) in (0, 2),
    (select count(*) from public.member)::text
  union all
  select 11, '世帯に結びついていない利用者の数(結びつけの後 0)',
    (select count(*) from public.household) = 0
      or (select count(*) from auth.users as u where not exists (select 1 from public.member as m where m.user_id = u.id)) = 0,
    (select count(*) from auth.users as u where not exists (select 1 from public.member as m where m.user_id = u.id))::text
  union all
  -- 参考(合否に使わない。ok は常に true)
  select 12, '(参考)postgres が public に作るテーブルの既定の権限(anon・authenticated)',
    true,
    coalesce((
      select string_agg(x::text, ' / ')
      from pg_default_acl as d
      join pg_namespace as dn on dn.oid = d.defaclnamespace
      join pg_roles as r on r.oid = d.defaclrole,
      lateral unnest(d.defaclacl) as x
      where dn.nspname = 'public' and r.rolname = 'postgres' and d.defaclobjtype = 'r'
        and (x::text like 'anon=%' or x::text like 'authenticated=%')
    ), '(なし)')
  union all
  select 13, '(参考)有効なイベントトリガーの数',
    true,
    (select count(*) from pg_event_trigger where evtenabled <> 'D')::text
) as result
order by n;
