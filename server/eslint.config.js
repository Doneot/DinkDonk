import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  {
    // scripts/ holds standalone Node utility scripts (plain .mjs, not part
    // of the app's TypeScript project/build), so type-aware linting has no
    // tsconfig to attach them to.
    ignores: [
      "dist/**",
      "node_modules/**",
      "eslint.config.js",
      "coverage/**",
      "scripts/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-explicit-any": "error",

      "@typescript-eslint/explicit-function-return-type": "off",

      "@typescript-eslint/no-floating-promises": "error",

      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],

      "@typescript-eslint/consistent-type-exports": "warn",

      "@typescript-eslint/no-misused-promises": [
        "error",
        {
          checksVoidReturn: false,
        },
      ],
    },
  },
];
