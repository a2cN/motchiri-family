-- 20261103120000_auth_household.sql の取り消し。存在しないものを消そうとしても失敗しない形(if exists)。
-- 失うもの: 世帯とメンバーの行(結びつけは ops/link-household.sql でいつでも作り直せる)。Auth のアカウントには触れない。
-- 業務のテーブルが public.household を参照していると、household の削除は失敗する(参照があるため)。そのときは業務のテーブルの取り消しと組にする。
-- private スキーマは空のときだけ消える(cascade を付けない)。

-- テーブルを消すと、そのテーブルのポリシーも消える。
drop table if exists public.member;
drop table if exists public.household;
drop function if exists private.current_household_ids();
drop schema if exists private;
