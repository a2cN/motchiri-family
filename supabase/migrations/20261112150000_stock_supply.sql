-- 倉庫 run 3a(stock-supply): 日用品のジャンル(自由入力)と備考の列、日用品の品物の形を守る check。
-- 決まり: 30_architecture.md Data Model・Interfaces §1(stock-supply)、OD-stock-supply-01 A、ADR 0009・0010。
-- run 1・2 の migration は書き換えない。テーブル・権限・ポリシー・trigger・関数・publication には触れない。begin・commit は書かない。

alter table public.item add column supply_genre text;
alter table public.item add column note text;

alter table public.item add constraint item_supply_genre_format
  check (supply_genre is null or (supply_genre = btrim(supply_genre) and char_length(supply_genre) between 1 and 100));
alter table public.item add constraint item_note_format
  check (note is null or (note = btrim(note) and char_length(note) between 1 and 1000));

-- 日用品の品物の形。食材のジャンルはマスタ(genre_id)、日用品のジャンルは文字(supply_genre)。日用品は場所を持たない。
alter table public.item add constraint item_supply_genre_only_supply check (item_kind = 'supply' or supply_genre is null);
alter table public.item add constraint item_note_only_supply check (item_kind = 'supply' or note is null);
alter table public.item add constraint item_supply_no_genre_master check (item_kind <> 'supply' or genre_id is null);
alter table public.item add constraint item_supply_no_location check (item_kind <> 'supply' or location_id is null);

comment on column public.item.supply_genre is '日用品のジャンル(自由入力。マスタではない)。null = ジャンルなし。食材は null';
comment on column public.item.note is '日用品の備考(自由記述)。null = なし。食材は null';
