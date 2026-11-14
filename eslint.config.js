import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.chrome,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          'argsIgnorePattern': '^_',
          'varsIgnorePattern': '^_',
          'caughtErrorsIgnorePattern': '^_',
        },
      ],
      'no-control-regex': 'off',
      // Debug output must not ship in the popup; errors and warnings are still reported.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The popup and the cards shown on pages build their DOM from text, never from HTML, so nothing a page or a
    // certificate holds can become markup. Tests may still set up pages with HTML.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/tests/**'],
    rules: {
      'no-restricted-properties': ['error',
        ...['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'createContextualFragment', 'setHTML', 'setHTMLUnsafe', 'srcdoc'].map(property => ({
          property,
          message: 'Build the DOM from text (textContent, createElement or JSX) instead of HTML.',
        })),
        ...['write', 'writeln'].map(property => ({
          object: 'document',
          property,
          message: 'Build the DOM from text (textContent, createElement or JSX) instead of HTML.',
        })),
      ],
      // A guard against slips, not a proof: an aliased document or Object.assign onto an element still gets through.
      'no-restricted-syntax': ['error',
        ...[
          "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          // document.write reached through window or globalThis, which no-restricted-properties does not match.
          "MemberExpression[object.property.name='document'][property.name='write']",
          "MemberExpression[object.property.name='document'][property.name='writeln']",
          "NewExpression[callee.name='DOMParser']",
        ].map(selector => ({
          selector,
          message: 'Build the DOM from text (textContent, createElement or JSX) instead of HTML.',
        })),
      ],
    },
  },
])
