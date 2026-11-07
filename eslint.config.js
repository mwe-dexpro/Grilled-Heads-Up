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
      // Relaxed: numbers in template strings (`${count} days`) are everyday and cannot fail; everything else (objects,
      // undefined, null, booleans, any) is still refused.
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      // Relaxed: `onClick={() => setOpen(false)}` is how React handlers are written; a void call as an arrow's whole body
      // is clear, and the rule still flags a void value used anywhere else (returned, assigned, passed on).
      "@typescript-eslint/no-confusing-void-expression": ["error", { ignoreArrowShorthand: true }],
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
    rules: {
      // Off: a false positive. It follows a function that reads a ref into everything that receives it (the list reader of
      // `useAppData`, the Subtasks offer's handlers), although none is called while rendering; refs are read only in handlers and effects.
      "react-hooks/refs": "off",
    },
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
      "security/detect-object-injection": "off", // 25
      "n/no-unsupported-features/node-builtins": "off", // 10
      "playwright/no-conditional-in-test": "off", // 4
      "vitest/valid-expect": "off", // 2
      "@eslint-community/eslint-comments/require-description": "off", // 2
      "playwright/expect-expect": "off", // 2
      "security/detect-unsafe-regex": "off", // 2
      "playwright/no-wait-for-timeout": "off", // 2
      "playwright/no-conditional-expect": "off", // 1
      "security/detect-non-literal-regexp": "off", // 1
      "security/detect-non-literal-fs-filename": "off", // 1
      "n/no-process-exit": "off", // 1
      "n/no-unsupported-features/es-syntax": "off", // 1
    },
  },

  // Last: switches off every rule that would fight Prettier's formatting.
  prettier,
);
