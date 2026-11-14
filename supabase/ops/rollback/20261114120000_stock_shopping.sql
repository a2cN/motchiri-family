-- 20261114120000_stock_shopping.sql の取り消し。存在しないものを消そうとしても失敗しない形(if exists)。
-- 買い物リストの全部(チェック・外した印を含む)、買い物メモ、残量で管理の品物の購入日を失う。品物・在庫・残量・マスタは残る。
-- 20261112150000_stock_supply.sql の取り消しより先に実行する。アプリも 3a の版へ戻し、service worker があれば取り下げること。
-- 本番に出して家族が使い始めたあとは、この SQL ではなく直しの migration を足す。

drop trigger if exists household_seed_shopping_memo on public.household;
drop trigger if exists item_stock_shopping_sync on public.item_stock;
drop trigger if exists item_shopping_release on public.item;
drop trigger if exists item_shopping_sync on public.item;

drop table if exists public.shopping_list;
drop table if exists public.shopping_memo;

drop function if exists private.seed_shopping_memo();
drop function if exists private.shopping_list_resync();
drop function if exists private.shopping_list_check_level();
drop function if exists private.shopping_list_before_write();
drop function if exists private.item_stock_shopping_sync();
drop function if exists private.item_shopping_release();
drop function if exists private.item_shopping_sync();
drop function if exists private.shopping_list_sync_item(uuid, uuid);

alter table public.item drop column if exists purchased_on;
