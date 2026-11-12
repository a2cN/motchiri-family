-- 20261112150000_stock_supply.sql の取り消し。存在しないものを消そうとしても失敗しない形(if exists)。
-- 日用品のジャンルと備考の値を失う(列を消すため)。日用品の品物の行そのものは消さない。
-- 20261111120000_stock_master.sql の取り消しより先に実行する。アプリも run 2 の版へ戻すこと。
-- 本番に出して家族が使い始めたあとは、この SQL ではなく直しの migration を足す。

alter table public.item drop constraint if exists item_supply_no_location;
alter table public.item drop constraint if exists item_supply_no_genre_master;
alter table public.item drop constraint if exists item_note_only_supply;
alter table public.item drop constraint if exists item_supply_genre_only_supply;
alter table public.item drop constraint if exists item_note_format;
alter table public.item drop constraint if exists item_supply_genre_format;

alter table public.item drop column if exists note;
alter table public.item drop column if exists supply_genre;
