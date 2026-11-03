import neostandard from 'neostandard'
import userscripts from 'eslint-plugin-userscripts'
import globals from 'globals'

const overrides = {}

const userscriptOverrides = {
  '@stylistic/semi': ['error', 'always'],
  '@stylistic/spaced-comment': 'off'
}

export default [
  {
    ignores: [
      '.kilo/**',
      'temp/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**'
    ]
  },
  ...neostandard({
    env: [
      'browser'
    ]
  }),
  {
    rules: {
      ...overrides
    }
  },
  {
    files: [
      '*.config.js'
    ],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: [
      '**/*.user.js'
    ],
    languageOptions: {
      globals: {
        GM_addStyle: 'readonly',
        GM_getResourceText: 'readonly',
        GM_getValue: 'readonly',
        GM_info: 'readonly',
        GM_listValues: 'readonly',
        GM_registerMenuCommand: 'readonly',
        GM_setValue: 'readonly',
        GM_unregisterMenuCommand: 'readonly',
        GM_xmlhttpRequest: 'readonly'
      }
    },
    plugins: {
      userscripts: {
        rules: userscripts.rules
      }
    },
    rules: {
      ...userscripts.configs.recommended.rules,
      ...userscriptOverrides
    },
    settings: {
      userscriptVersions: {
        tampermonkey: '*',
        violentmonkey: '*'
      }
    }
  },
  {
    files: [
      'tests/**/*.js'
    ],
    rules: {
      ...userscriptOverrides
    }
  }
]
