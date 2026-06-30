// @ts-check
// Root ESLint flat config for the meal-planner monorepo.
//
// Minimal, conventional setup: `@eslint/js` recommended + typescript-eslint
// "recommended" (NON-type-checked, so it does not require the TS build or a
// per-package `parserOptions.project` — keeps lint fast and decoupled from
// build order).
//
// Each workspace runs `eslint src/` from its own directory. A thin
// `eslint.config.js` in each package re-exports this config so ESLint resolves
// it regardless of config-lookup behaviour.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  // Global ignores (no other keys -> applies to every config object).
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      '**/*.d.ts',
    ],
  },

  // Base JS recommended rules.
  js.configs.recommended,

  // typescript-eslint recommended (non-type-checked).
  ...tseslint.configs.recommended,

  // Project-wide language options for TS/TSX sources.
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      // The codebase predates linting. Surface (don't fail on) the two most
      // common legacy findings so CI stays green while flagging tech debt.
      // Follow-up: tighten these back to "error" and burn down the warnings.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
