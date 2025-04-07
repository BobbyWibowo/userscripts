import neostandard from 'neostandard'
import stylisticJs from '@stylistic/eslint-plugin-js'
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
      '@stylistic/js': stylisticJs
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
        $: 'readonly',
        cloneInto: 'readonly',
        exportFunction: 'readonly',
        unsafeWindow: 'readonly',
        GM_addStyle: 'readonly',
        GM_getValue: 'readonly',
        GM_setValue: 'readonly'
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
