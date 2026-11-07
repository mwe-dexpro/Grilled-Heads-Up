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

const leftOutMessage = "A test that is left out needs an issue: disable this rule on the line with a reason that names it (#123). See docs/agents/testing.md.";
const leftOutVitest = {
  selector: "MemberExpression[object.name=/^(it|test|describe|suite)$/][property.name=/^(skipIf|runIf|todo)$/]",
  message: leftOutMessage,
};
const leftOutPlaywright = { selector: "MemberExpression[property.name='fixme']", message: leftOutMessage };

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
      // Off: it flags every `obj[key]` (25 hits here, none a real injection: keys are literals, enum values or ids looked up in
      // a Map or Record we built). With noUncheckedIndexedAccess the compiler already makes every such read prove it exists.
      "security/detect-object-injection": "off",
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
    rules: {
      // Relaxed for node:sqlite only: it is experimental in Node 22 on purpose (ADR-0005; the server starts with
      // --disable-warning=ExperimentalWarning). Any other experimental or too-new built-in is still refused.
      "n/no-unsupported-features/node-builtins": ["error", { ignores: ["sqlite", "sqlite.DatabaseSync"] }],
    },
  },
  {
    // Relaxed for the tools' tests only: `path.matchesGlob` (Node 22.20 and later) reads the real Stryker globs in a test. The code
    // that ships does not use it; CI and the Docker image run the current Node 22.
    files: ["tools/src/**/*.test.ts"],
    rules: { "n/no-unsupported-features/node-builtins": ["error", { ignores: ["sqlite", "sqlite.DatabaseSync", "path.matchesGlob"] }] },
  },
  {
    // Off for the bootstrap file only: the shutdown handler ends the process on purpose, once the server and the database are closed.
    files: ["server/src/server.ts"],
    rules: { "n/no-process-exit": "off" },
  },
  {
    // Off here only: the path is the operator's DATABASE_FILE setting, not input from a request.
    files: ["server/src/database.ts"],
    rules: { "security/detect-non-literal-fs-filename": "off" },
  },
  {
    // Off for the command-line tools: they read the files they are told to on the command line, run by a developer or by CI.
    files: ["tools/src/cli.ts", "tools/src/bin/**/*.ts"],
    rules: { "security/detect-non-literal-fs-filename": "off" },
  },

  // Unit tests.
  {
    files: ["**/*.test.ts"],
    plugins: { vitest },
    rules: {
      // Off in tests: they make and read files in a temporary folder of their own.
      "security/detect-non-literal-fs-filename": "off",
      "vitest/expect-expect": "error",
      "vitest/no-focused-tests": "error",
      "vitest/no-disabled-tests": "error",
      // `skipIf`, `runIf` and `todo` (a test that is not there) leave a test out without `.skip`: they need the same disable with an issue as `it.skip` (see lint:skips).
      "no-restricted-syntax": ["error", leftOutVitest],
      // Vitest's expect takes a message as its second argument (`expect(value, "what it is")`), which the default of 1 refuses.
      "vitest/valid-expect": ["error", { maxArgs: 2 }],
    },
  },

  // Playwright tests.
  {
    files: ["e2e/**/*.ts"],
    extends: [playwright.configs["flat/recommended"]],
    rules: {
      // `registerOwner` (e2e/passkeys.ts) holds the assertion of the two setup steps.
      "playwright/expect-expect": ["error", { assertFunctionNames: ["registerOwner"] }],
      "playwright/no-focused-test": "error",
      "playwright/no-skipped-test": "error",
      // `test.fixme` and `test.describe.fixme` leave a test out like `test.skip`: same disable, same issue (see lint:skips).
      "no-restricted-syntax": ["error", leftOutPlaywright],
      "playwright/missing-playwright-await": "error",
      "playwright/no-wait-for-timeout": "error",
    },
  },

  // Last: switches off every rule that would fight Prettier's formatting.
  prettier,
);
