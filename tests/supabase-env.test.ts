import { describe, expect, it } from "vitest";
import { KEY_VAR, SECRET_CHECK_VAR, URL_VAR, selectSupabaseEnv } from "../scripts/supabase-env.mjs";

// 値の選び方(30_architecture.md Interfaces §5)。値はテストの中の架空のもの。
const localStatus = {
  API_URL: "http://127.0.0.1:54321",
  PUBLISHABLE_KEY: "local-publishable",
  ANON_KEY: "local-anon",
  SECRET_KEY: "local-secret",
  SERVICE_ROLE_KEY: "local-service",
};

describe("selectSupabaseEnv", () => {
  it("環境変数が両方あれば、それを使う(ローカルの状態より優先)", () => {
    const r = selectSupabaseEnv({ [URL_VAR]: "https://x.example.com", [KEY_VAR]: "env-key" }, localStatus);
    expect(r).toEqual({ source: "env", vars: { [URL_VAR]: "https://x.example.com", [KEY_VAR]: "env-key" } });
  });

  it("環境変数が片方だけなら、ローカルの状態を使う", () => {
    const r = selectSupabaseEnv({ [URL_VAR]: "https://x.example.com" }, localStatus);
    expect(r?.source).toBe("local");
    expect(r?.vars[URL_VAR]).toBe("http://127.0.0.1:54321");
  });

  it("ローカルでは新しい形式の公開用キーを第一に、検査用の秘密のキーも渡す", () => {
    const r = selectSupabaseEnv({}, localStatus);
    expect(r).toEqual({
      source: "local",
      vars: { [URL_VAR]: "http://127.0.0.1:54321", [KEY_VAR]: "local-publishable", [SECRET_CHECK_VAR]: "local-secret" },
    });
  });

  it("新しい形式のキーが無ければ、古い形式(anon)を使う", () => {
    const { PUBLISHABLE_KEY: _p, SECRET_KEY: _s, ...old } = localStatus;
    void _p;
    void _s;
    const r = selectSupabaseEnv({}, old);
    expect(r?.vars[KEY_VAR]).toBe("local-anon");
    expect(r?.vars[SECRET_CHECK_VAR]).toBe("local-service");
  });

  it("どちらも無ければ null", () => {
    expect(selectSupabaseEnv({}, null)).toBeNull();
    expect(selectSupabaseEnv({}, { API_URL: "http://127.0.0.1:54321" })).toBeNull();
    expect(selectSupabaseEnv({ [URL_VAR]: "", [KEY_VAR]: "" }, {})).toBeNull();
  });
});
