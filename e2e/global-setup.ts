import { randomUUID } from "node:crypto";
import { cli, parseJson, sql } from "./db";

// E2E の前に、ローカルの Supabase にテストの利用者と世帯を作る(30_architecture.md Interfaces §8)。
//   世帯 A: A1・A2 / 世帯 B: B1 / 世帯に結びつけない: U0
//   倉庫(stock-food): 画面サイズ(project)ごとに世帯 S-<project> と2人(S1・S2)。倉庫の spec は自分の project の世帯だけを使う(D-21)
//   倉庫(stock-supply): 同じく D-<project>(D1・D2。日用品の spec)と DS-<project>(DS。スクリーンショットの spec)。run 1・2 の世帯とは別(30_architecture.md S-12)
//   倉庫(stock-master): 同じく M-<project>(M1・M2。マスタを変える spec)と MS-<project>(MS。スクリーンショットの spec)。マスタを変えるので別の世帯(30_architecture.md M-13)
// メールは e2e-…@example.com(架空)、パスワードは実行のたびの乱数。ローカルの秘密のキーはこのプロセスのメモリの中だけ(ファイルにもログにも出さない)。
// 値は環境変数でテストのワーカーに渡す(E2E_…)。ローカル(127.0.0.1)以外には、何もしない。
export const STOCK_PROJECTS = ["ipad-portrait", "ipad-landscape", "iphone-portrait"] as const;

export default async function globalSetup() {
  const status = parseJson(cli(["status", "-o", "json"]));
  const apiUrl: string = status.API_URL;
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(apiUrl)) {
    throw new Error("E2E のテストの利用者は、ローカルの Supabase にだけ作る");
  }
  const publishableKey: string = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
  // 管理用の API には、古い形式(JWT)のキーを使う。このプロセスのメモリの中だけ
  const adminKey: string = status.SERVICE_ROLE_KEY;

  // 前の実行の残りを消す(npm run e2e は先に db reset するが、手で playwright test だけを動かしたときのため)
  sql("delete from auth.users where email like 'e2e-%@example.com'");
  sql("delete from public.household as h where not exists (select 1 from public.member as m where m.household_id = h.id)");

  const password = `pw-${randomUUID()}`;
  const emails = {
    A1: "e2e-a1@example.com",
    A2: "e2e-a2@example.com",
    B1: "e2e-b1@example.com",
    U0: "e2e-u0@example.com",
  } as const;

  const stockEmails: Record<string, string> = {};
  for (const project of STOCK_PROJECTS) {
    stockEmails[`S1_${project}`] = `e2e-s1-${project}@example.com`;
    stockEmails[`S2_${project}`] = `e2e-s2-${project}@example.com`;
    // スクリーンショットの spec の世帯(別のファイルが同じ世帯を同時に触らない。D-21)
    stockEmails[`SH_${project}`] = `e2e-sh-${project}@example.com`;
    // run 2(stock-master): マスタを変える spec と、そのスクリーンショットの spec の世帯
    stockEmails[`M1_${project}`] = `e2e-m1-${project}@example.com`;
    stockEmails[`M2_${project}`] = `e2e-m2-${project}@example.com`;
    stockEmails[`MS_${project}`] = `e2e-ms-${project}@example.com`;
    // run 3a(stock-supply): 日用品の spec と、そのスクリーンショットの spec の世帯
    stockEmails[`D1_${project}`] = `e2e-d1-${project}@example.com`;
    stockEmails[`D2_${project}`] = `e2e-d2-${project}@example.com`;
    stockEmails[`DS_${project}`] = `e2e-ds-${project}@example.com`;
  }

  const ids: Record<string, string> = {};
  for (const [who, email] of [...Object.entries(emails), ...Object.entries(stockEmails)]) {
    const res = await fetch(`${apiUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: adminKey, authorization: `Bearer ${adminKey}` },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!res.ok) throw new Error(`テストの利用者 ${who} を作れませんでした(HTTP ${res.status})`);
    ids[who] = (await res.json()).id;
  }

  // service_role には GRANT が無いので(Data Model)、世帯とメンバーは SQL で作る
  const householdA = String(sql("insert into public.household default values returning id")[0].id);
  const householdB = String(sql("insert into public.household default values returning id")[0].id);
  sql(
    `insert into public.member (user_id, household_id) values ('${ids.A1}', '${householdA}'), ('${ids.A2}', '${householdA}'), ('${ids.B1}', '${householdB}')`,
  );

  for (const project of STOCK_PROJECTS) {
    const household = String(sql("insert into public.household default values returning id")[0].id);
    sql(
      `insert into public.member (user_id, household_id) values ('${ids[`S1_${project}`]}', '${household}'), ('${ids[`S2_${project}`]}', '${household}')`,
    );
    process.env[`E2E_STOCK_${project}_HOUSEHOLD_ID`] = household;
    process.env[`E2E_STOCK_${project}_S1_EMAIL`] = stockEmails[`S1_${project}`];
    process.env[`E2E_STOCK_${project}_S2_EMAIL`] = stockEmails[`S2_${project}`];
    const shots = String(sql("insert into public.household default values returning id")[0].id);
    sql(`insert into public.member (user_id, household_id) values ('${ids[`SH_${project}`]}', '${shots}')`);
    process.env[`E2E_STOCK_${project}_SHOTS_HOUSEHOLD_ID`] = shots;
    process.env[`E2E_STOCK_${project}_SH_EMAIL`] = stockEmails[`SH_${project}`];
    const master = String(sql("insert into public.household default values returning id")[0].id);
    sql(`insert into public.member (user_id, household_id) values ('${ids[`M1_${project}`]}', '${master}'), ('${ids[`M2_${project}`]}', '${master}')`);
    process.env[`E2E_STOCK_${project}_MASTER_HOUSEHOLD_ID`] = master;
    process.env[`E2E_STOCK_${project}_M1_EMAIL`] = stockEmails[`M1_${project}`];
    process.env[`E2E_STOCK_${project}_M2_EMAIL`] = stockEmails[`M2_${project}`];
    const mshots = String(sql("insert into public.household default values returning id")[0].id);
    sql(`insert into public.member (user_id, household_id) values ('${ids[`MS_${project}`]}', '${mshots}')`);
    process.env[`E2E_STOCK_${project}_MSHOTS_HOUSEHOLD_ID`] = mshots;
    process.env[`E2E_STOCK_${project}_MS_EMAIL`] = stockEmails[`MS_${project}`];
    const supply = String(sql("insert into public.household default values returning id")[0].id);
    sql(`insert into public.member (user_id, household_id) values ('${ids[`D1_${project}`]}', '${supply}'), ('${ids[`D2_${project}`]}', '${supply}')`);
    process.env[`E2E_STOCK_${project}_SUPPLY_HOUSEHOLD_ID`] = supply;
    process.env[`E2E_STOCK_${project}_D1_EMAIL`] = stockEmails[`D1_${project}`];
    process.env[`E2E_STOCK_${project}_D2_EMAIL`] = stockEmails[`D2_${project}`];
    const sshots = String(sql("insert into public.household default values returning id")[0].id);
    sql(`insert into public.member (user_id, household_id) values ('${ids[`DS_${project}`]}', '${sshots}')`);
    process.env[`E2E_STOCK_${project}_SSHOTS_HOUSEHOLD_ID`] = sshots;
    process.env[`E2E_STOCK_${project}_DS_EMAIL`] = stockEmails[`DS_${project}`];
  }

  process.env.E2E_SUPABASE_URL = apiUrl;
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY = publishableKey;
  process.env.E2E_PASSWORD = password;
  process.env.E2E_HOUSEHOLD_A_ID = householdA;
  for (const [who, email] of Object.entries(emails)) process.env[`E2E_${who}_EMAIL`] = email;
}
