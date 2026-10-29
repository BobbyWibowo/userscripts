import neostandard from 'neostandard'
import stylistic from '@stylistic/eslint-plugin'
import userscripts from 'eslint-plugin-userscripts'

const overrides = {}

const userscriptOverrides = {
  '@stylistic/semi': ['error', 'always'],
  '@stylistic/spaced-comment': 'off'
}

export default [
  ...neostandard({
    env: [
      'browser'
    ]
  }),
  {
    plugins: {
      '@stylistic': stylistic
    },
    rules: {
      ...overrides
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
  }
]
