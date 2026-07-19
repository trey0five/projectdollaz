import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // eslint-plugin-react-hooks v7 turns the React Compiler DIAGNOSTICS into
      // errors in its recommended set. This codebase predates the compiler, so we
      // adopt those hints INCREMENTALLY as warnings (visible, non-blocking) while
      // keeping the proven bug-catchers (`rules-of-hooks`, `exhaustive-deps`) at
      // their recommended levels. Promote these back to `error` as we clean them up.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/gating': 'warn',
      // `motion` is imported solely as a JSX namespace (`<motion.div>`), which
      // base no-unused-vars does not track (no react/jsx-uses-vars plugin here),
      // so it would be flagged as unused in every animated component. Ignore it
      // alongside the existing PascalCase/CONSTANT component-import convention.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^([A-Z_]|motion$)' }],
      'react-refresh/only-export-components': 'off',
    },
  },
]
