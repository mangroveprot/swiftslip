import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

const serverOnlyPackage = {
  name: "server-only",
  message:
    "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
};

// Architecture boundaries — see README.md ("Architecture").
const FRONTEND_MAY_NOT_IMPORT_BACKEND = {
  paths: [serverOnlyPackage],
  patterns: [
    {
      group: ["@/server/**", "@/config/env.server"],
      message:
        "Frontend code must not import backend code. Call a server function from `@/api/*` instead.",
    },
  ],
};

const BACKEND_MAY_NOT_IMPORT_FRONTEND = {
  paths: [serverOnlyPackage],
  patterns: [
    {
      group: ["@/features/**", "@/components/**", "@/routes/**", "@/hooks/**"],
      message: "Backend code must not depend on UI code.",
    },
  ],
};

const SHARED_MUST_STAY_PURE = {
  paths: [serverOnlyPackage, { name: "react", message: "`src/shared` must stay framework-free." }],
  patterns: [
    {
      group: [
        "@/server/**",
        "@/api/**",
        "@/features/**",
        "@/components/**",
        "@/routes/**",
        "@/config/env.server",
      ],
      message: "`src/shared` is imported by both sides, so it can't depend on either.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi", ".wrangler"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    files: ["src/features/**", "src/components/**", "src/hooks/**", "src/routes/**", "src/lib/**"],
    rules: { "no-restricted-imports": ["error", FRONTEND_MAY_NOT_IMPORT_BACKEND] },
  },
  {
    files: ["src/server/**", "src/api/**"],
    rules: { "no-restricted-imports": ["error", BACKEND_MAY_NOT_IMPORT_FRONTEND] },
  },
  {
    files: ["src/shared/**"],
    rules: { "no-restricted-imports": ["error", SHARED_MUST_STAY_PURE] },
  },
  eslintPluginPrettier,
);
