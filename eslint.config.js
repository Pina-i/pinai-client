import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/**
 * Layer boundaries, enforced.
 *
 * These mirror the dependency rule in CLAUDE.md, and they are what makes the
 * planned split into shared packages (`domain`, `api`, `crypto`, `app-state`)
 * a move rather than an excavation: an import that crosses a boundary today
 * is a file that would have to be duplicated into the mobile app tomorrow.
 *
 * Each entry lists what a layer may NOT reach for. Relative spellings are
 * included so `../../adapters/x` is caught alongside `@/adapters/x`.
 */
const boundary = (files, groups, message) => ({
  files,
  rules: {
    'no-restricted-imports': ['error', { patterns: [{ group: groups, message }] }],
  },
})

const OUTWARD = (...layers) =>
  layers.flatMap((l) => [`@/${l}`, `@/${l}/**`, `**/${l}/**`])

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
      globals: globals.browser,
    },
  },

  boundary(
    ['src/domain/**/*.{ts,tsx}'],
    OUTWARD('adapters', 'store', 'presentation', 'routes', 'ioc', 'lib'),
    'The domain depends on nothing. Take what you need as a port parameter ' +
      '(see domain/ports/) and let the IoC container inject the implementation.',
  ),

  boundary(
    ['src/adapters/**/*.{ts,tsx}'],
    OUTWARD('store', 'presentation', 'routes', 'ioc'),
    'Adapters implement domain ports; they may not reach outward into UI ' +
      'state, the UI itself, or the container that wires them.',
  ),

  boundary(
    ['src/store/**/*.{ts,tsx}'],
    OUTWARD('presentation', 'routes', 'ioc', 'adapters'),
    'UI state may depend on the domain, not on the UI or on a concrete ' +
      'adapter — the mobile app will reuse these slices with its own adapters.',
  ),

  boundary(
    ['src/presentation/**/*.{ts,tsx}', 'src/routes/**/*.{ts,tsx}'],
    OUTWARD('adapters'),
    'Reach for a port via @/ioc rather than importing an adapter directly.',
  ),
])
