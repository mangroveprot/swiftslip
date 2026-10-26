import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

// `shared` is imported by both api and web, so it can depend on neither.
export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "react", message: "`shared` must stay framework-free." }],
          patterns: [
            {
              group: ["@swiftslip/web/**", "@swiftslip/api/**", "**/web/**", "**/api/**"],
              message: "`shared` is imported by both sides, so it can't depend on either.",
            },
          ],
        },
      ],
    },
  },
  eslintPluginPrettier,
);
