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
      // `motion` is imported solely as a JSX namespace (`<motion.div>`), which
      // base no-unused-vars does not track (no react/jsx-uses-vars plugin here),
      // so it would be flagged as unused in every animated component. Ignore it
      // alongside the existing PascalCase/CONSTANT component-import convention.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^([A-Z_]|motion$)' }],
      'react-refresh/only-export-components': 'off',
    },
  },
]
