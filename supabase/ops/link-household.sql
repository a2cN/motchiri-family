-- 2人を1つの世帯に結びつける型紙(OD-auth-household-03 A)。
-- 使い方: Supabase の SQL Editor に貼り、下の2つの文字列を、その場で2人のメールアドレスに書き換えて1回だけ実行する。
--   ・メールアドレスをこのファイル、チャット、文書に書かない。SQL Editor に保存しない。
--   ・実行の結果の画面を、チャットに貼らない。
-- 止まる条件(止まったら何も作られない): 世帯がすでにある / 2つのメールが同じ / 2つのメールに当たる利用者がちょうど2人でない。
-- 止まるときのメッセージにメールアドレスと ID は含まれない。
do $$
declare
  email_1 constant text := '<1人目のメール>';
  email_2 constant text := '<2人目のメール>';
  found_count integer;
  new_household uuid;
begin
  if (select count(*) from public.household) > 0 then
    raise exception '世帯がすでにあります。結びつけは行いません。';
  end if;

  if lower(email_1) = lower(email_2) then
    raise exception '2つのメールが同じです。';
  end if;

  select count(*) into found_count
  from auth.users as u
  where lower(u.email) in (lower(email_1), lower(email_2));

  if found_count <> 2 then
    raise exception '利用者がちょうど2人は見つかりませんでした(見つかった数: %)。', found_count;
  end if;

  insert into public.household default values returning id into new_household;

  insert into public.member (user_id, household_id)
  select u.id, new_household
  from auth.users as u
  where lower(u.email) in (lower(email_1), lower(email_2));
end
$$;
