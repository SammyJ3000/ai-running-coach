// Lints the server code, scripts, tests and the browser app in js/.
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'tmp/', 'form/', 'evals/runs/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    ignores: ['js/**'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
  },
  {
    // The browser app: classic scripts that share one global scope, loaded in order by index.html (.jsx is compiled
    // in the browser by Babel). Each file names what it takes from earlier files in a /* global */ comment and what
    // it provides in an /* exported */ comment, so no-undef catches a name used without being listed.
    // tests/browser-scripts.test.js checks the lists against the load order.
    files: ['js/**/*.js', 'js/**/*.jsx'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, React: 'readonly', ReactDOM: 'readonly' },
    },
  },
  {
    rules: {
      // Destructuring a field out to drop it ({ hr_series, ...rest }) is deliberate.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
];
