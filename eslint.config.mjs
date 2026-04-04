import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "**/*.js", "**/*.mjs", "**/*.jsx"],
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // Use recommended rules but downgrade errors to warnings
      // to avoid breaking existing code
      ...Object.fromEntries(
        Object.entries(tseslint.configs.recommended.rules ?? {}).map(
          ([rule, config]) => {
            if (Array.isArray(config) && config[0] === "error") {
              return [rule, ["warn", ...config.slice(1)]];
            }
            if (config === "error") {
              return [rule, "warn"];
            }
            return [rule, config];
          }
        )
      ),
    },
  },
];
