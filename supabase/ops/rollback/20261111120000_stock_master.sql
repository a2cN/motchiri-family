-- 20261111120000_stock_master.sql の取り消し。存在しないものを消そうとしても失敗しない形(if exists)。
-- データは失わない(テーブル・列を足していないため)。20261109150000_stock_food.sql の取り消しより先に実行する。
-- 戻ると、マスタの書き込みと品物の削除ができなくなる。アプリも run 1 の版へ戻すこと。

drop trigger if exists unit_release_references on public.unit;
drop trigger if exists location_release_references on public.location;
drop trigger if exists item_stock_require_count_item on public.item_stock;
drop trigger if exists item_drop_stocks_on_level on public.item;

drop function if exists private.unit_release_references();
drop function if exists private.location_release_references();
drop function if exists private.item_stock_require_count_item();
drop function if exists private.item_drop_stocks_on_level();

drop policy if exists item_delete on public.item;
drop policy if exists unit_delete on public.unit;
drop policy if exists unit_update on public.unit;
drop policy if exists unit_insert on public.unit;
drop policy if exists location_delete on public.location;
drop policy if exists location_update on public.location;
drop policy if exists location_insert on public.location;
drop policy if exists genre_delete on public.genre;
drop policy if exists genre_update on public.genre;
drop policy if exists genre_insert on public.genre;

revoke insert, update, delete on table public.genre, public.location, public.unit from authenticated;
revoke delete on table public.item from authenticated;
