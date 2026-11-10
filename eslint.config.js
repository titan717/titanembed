import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["public/**", "site/docs/**", "dist", "packages/sdk/dist", "node_modules", "site/docs", "test-results", "playwright-report"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node }, ecmaVersion: 2022, sourceType: "module" },
    rules: {
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-restricted-properties": ["error", { object: "document", property: "write", message: "never" }],
      "no-restricted-syntax": ["error", { selector: "AssignmentExpression[left.property.name='innerHTML']", message: "Never assign innerHTML: build DOM nodes (security)." }, { selector: "AssignmentExpression[left.property.name='outerHTML']", message: "Never assign outerHTML." }, { selector: "CallExpression[callee.property.name='insertAdjacentHTML']", message: "Never insert HTML strings." }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error"
    }
  }
);
