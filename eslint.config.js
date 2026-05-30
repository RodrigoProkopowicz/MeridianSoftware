import js from '@eslint/js';
import globals from 'globals';

/**
 * Flat config. El repo mezcla tres runtimes:
 *   - src/**          frontend, browser + ESM
 *   - functions/**    Cloud Functions, Node + CommonJS (require/exports)
 *   - scripts/**, *.config.js  tooling, Node + ESM
 *
 * no-unused-vars queda en `warn` (no rompe el build): es un radar para el dead
 * code que se vaya acumulando, no un bloqueo. El resto de las reglas
 * recommended (no-undef, no-unreachable, etc.) sí son errores.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**', '.firebase/**', '.claude/**', 'public/**', 'functions/scripts/service-account.json'] },

  js.configs.recommended,

  {
    // Reglas nuevas y agresivas de la recommended de eslint v10: las dejamos en
    // `warn` para no forzar reescrituras de código de pago/AFIP por un nit.
    rules: {
      'no-useless-assignment': 'warn',
      'preserve-caught-error': 'warn',
    },
  },

  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['functions/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['scripts/**/*.mjs', 'functions/scripts/**/*.mjs', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
];
