// CSS の色の直書きを止める。色の値を書いてよいのは src/styles/tokens.css だけ
// (ADR 0005 決定 1、UI-02、30_architecture.md D-12)。書式の規則は入れない(目的の外)。
const COLOR_FUNCTIONS = ["rgb", "rgba", "hsl", "hsla", "oklch", "oklab", "lab", "lch", "hwb", "color"];

const stylelintConfig = {
  rules: {
    "color-no-hex": true,
    "function-disallowed-list": COLOR_FUNCTIONS,
    "color-named": "never",
    // Tailwind v4 のルール
    "at-rule-no-unknown": [
      true,
      { ignoreAtRules: ["theme", "apply", "custom-variant", "utility", "variant", "source", "reference", "plugin", "config"] },
    ],
  },
  overrides: [
    {
      files: ["src/styles/tokens.css"],
      rules: {
        "color-no-hex": null,
        "function-disallowed-list": null,
        "color-named": null,
      },
    },
  ],
};

export default stylelintConfig;
