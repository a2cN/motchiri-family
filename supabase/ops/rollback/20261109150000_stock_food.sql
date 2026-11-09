-- 20261109150000_stock_food.sql の取り消し。存在しないものを消そうとしても失敗しない形(if exists)。
-- 失うもの: 倉庫のデータ全部(品物・在庫・マスタ)。戻せない。auth-household の取り消しより先に実行する。
-- run 2・3 の migration を当てているときは、それらの取り消しを先に(逆の順で)実行する。

drop policy if exists household_broadcast_select on realtime.messages;
drop trigger if exists household_seed_masters on public.household;

-- テーブルを消すと、そのテーブルの trigger とポリシーも消える。
drop table if exists public.item_stock;
drop table if exists public.item;
drop table if exists public.unit;
drop table if exists public.genre;
drop table if exists public.location;

drop function if exists private.on_household_created();
drop function if exists private.seed_household_masters(uuid);
drop function if exists private.broadcast_household_change();
drop function if exists private.set_updated_at();
