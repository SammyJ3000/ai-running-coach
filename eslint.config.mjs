// Lints the server code, scripts and tests. The React code inside index.html is not linted (no build step).
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'tmp/', 'form/', 'evals/runs/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: globals.node },
  },
  {
    rules: {
      // Destructuring a field out to drop it ({ hr_series, ...rest }) is deliberate.
      'no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
];
