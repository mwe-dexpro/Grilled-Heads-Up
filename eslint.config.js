// @ts-check
import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import js from "@eslint/js";
import vitest from "@vitest/eslint-plugin";
import prettier from "eslint-config-prettier";
import n from "eslint-plugin-n";
import playwright from "eslint-plugin-playwright";
import reactHooks from "eslint-plugin-react-hooks";
import security from "eslint-plugin-security";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * One flat config for the whole repo (client, server, tools, e2e). Rules the presets enable stay on; each rule that is
 * turned off or relaxed below has a one-line reason next to it. Run with `--max-warnings 0` (`npm run lint:eslint`).
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/reports/**",
      "**/.stryker-tmp/**",
      "**/node_modules/**",
      ".claude/**",
      "playwright-report/**",
      "test-results/**",
      "docs/design/prototype/**",
      "client/public/**",
    ],
  },
  { linterOptions: { reportUnusedDisableDirectives: "error" } },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  security.configs.recommended,
  comments.recommended,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Every disable names its rule and says why, and none outlives the code it was for.
      "@eslint-community/eslint-comments/require-description": ["error", { ignore: [] }],
      "@eslint-community/eslint-comments/no-unlimited-disable": "error",
      "@eslint-community/eslint-comments/no-unused-disable": "error",
      "@eslint-community/eslint-comments/disable-enable-pair": "error",
      // The typed rules must stay errors (the issue's list); the strict preset has most of them, listed so they cannot be dropped.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/only-throw-error": "error",
      "@typescript-eslint/require-await": "error",
    },
  },

  // Plain JavaScript (this file) has no type information.
  { files: ["**/*.js", "**/*.mjs"], extends: [tseslint.configs.disableTypeChecked] },

  // The client runs in the browser.
  {
    files: ["client/src/**/*.{ts,tsx}", "client/*.ts"],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["client/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },

  // The server and the tools run in Node.
  {
    files: ["server/src/**/*.ts", "tools/src/**/*.ts"],
    extends: [n.configs["flat/recommended-module"]],
    languageOptions: { globals: globals.node },
  },

  // Unit tests.
  {
    files: ["**/*.test.ts"],
    plugins: { vitest },
    rules: {
      "vitest/expect-expect": "error",
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      "vitest/valid-expect": "error",
    },
  },

  // Playwright tests.
  {
    files: ["e2e/**/*.ts"],
    extends: [playwright.configs["flat/recommended"]],
    rules: {
      "playwright/expect-expect": "error",
      "playwright/no-focused-test": "error",
      "playwright/no-skipped-test": "error",
      "playwright/missing-playwright-await": "error",
      "playwright/no-wait-for-timeout": "error",
    },
  },

  // TEMPORARY: rules whose violations are fixed in the commits that follow, one rule or rule group per commit. Each
  // commit deletes its lines from here; this block is empty (and gone) at the end of the issue.
  {
    rules: {
      "@typescript-eslint/no-confusing-void-expression": "off", // 133
      "@typescript-eslint/restrict-template-expressions": "off", // 69
      "@typescript-eslint/strict-boolean-expressions": "off", // 41
      "security/detect-object-injection": "off", // 25
      "@typescript-eslint/array-type": "off", // 20
      "@typescript-eslint/no-misused-promises": "off", // 19
      "n/no-unsupported-features/node-builtins": "off", // 10
      "@typescript-eslint/no-deprecated": "off", // 9
      "@typescript-eslint/no-unsafe-assignment": "off", // 8
      "@typescript-eslint/require-await": "off", // 7
      "@typescript-eslint/prefer-optional-chain": "off", // 5
      "@typescript-eslint/no-unused-vars": "off", // 5
      "@typescript-eslint/no-unsafe-argument": "off", // 5
      "@typescript-eslint/no-floating-promises": "off", // 4
      "react-hooks/exhaustive-deps": "off", // 4
      "playwright/no-conditional-in-test": "off", // 4
      "@typescript-eslint/no-unsafe-member-access": "off", // 4
      "@typescript-eslint/no-meaningless-void-operator": "off", // 3
      "@typescript-eslint/no-empty-function": "off", // 3
      "react-hooks/refs": "off", // 3
      "@typescript-eslint/no-unsafe-return": "off", // 3
      "@typescript-eslint/prefer-nullish-coalescing": "off", // 3
      "@typescript-eslint/non-nullable-type-assertion-style": "off", // 3
      "@typescript-eslint/prefer-promise-reject-errors": "off", // 3
      "@typescript-eslint/no-unnecessary-type-assertion": "off", // 3
      "vitest/valid-expect": "off", // 2
      "react-hooks/set-state-in-effect": "off", // 2
      "@typescript-eslint/no-unnecessary-condition": "off", // 2
      "@eslint-community/eslint-comments/require-description": "off", // 2
      "@typescript-eslint/no-base-to-string": "off", // 2
      "playwright/expect-expect": "off", // 2
      "security/detect-unsafe-regex": "off", // 2
      "playwright/no-wait-for-timeout": "off", // 2
      "react-hooks/preserve-manual-memoization": "off", // 1
      "@typescript-eslint/switch-exhaustiveness-check": "off", // 1
      "react-hooks/immutability": "off", // 1
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off", // 1
      "@typescript-eslint/only-throw-error": "off", // 1
      "@typescript-eslint/no-redundant-type-constituents": "off", // 1
      "playwright/no-conditional-expect": "off", // 1
      "security/detect-non-literal-regexp": "off", // 1
      "@typescript-eslint/no-unsafe-call": "off", // 1
      "security/detect-non-literal-fs-filename": "off", // 1
      "n/no-process-exit": "off", // 1
      "@typescript-eslint/consistent-type-definitions": "off", // 1
      "n/no-unsupported-features/es-syntax": "off", // 1
    },
  },

  // Last: switches off every rule that would fight Prettier's formatting.
  prettier,
);
