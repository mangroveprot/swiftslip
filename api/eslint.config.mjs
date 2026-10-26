import js from '@eslint/js';
import eslintPluginPrettier from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'build',
      'logs',
      'drizzle',
      'drizzle.config.ts',
      'tsup.config.ts',
      '**/database.types.ts',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      // The backend must never reach into the frontend.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@swiftslip/web/**', '**/web/**'],
              message: 'Backend code must not depend on frontend code.',
            },
          ],
        },
      ],
      // `core/config` is the ONE place that reads the environment.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read configuration from `core/config`, never from process.env.',
        },
      ],
    },
  },
  {
    // The one allowed reader of process.env.
    files: ['src/core/config/**'],
    rules: { 'no-restricted-properties': 'off' },
  },
  eslintPluginPrettier,
);
