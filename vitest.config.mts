import path from "node:path";
import { defineConfig } from "vitest/config";

// DOM 環境は入れない(30_architecture.md D-07)。画面の確認は E2E が持つ。
export default defineConfig({
  // tsconfig の paths("@/*")と同じ。store などの単体テストが src の中を @/ で import できるように
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    // ESLint の API で Tailwind の設定を読むので、最初の1回は時間がかかる
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
