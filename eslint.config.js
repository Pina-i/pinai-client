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

/** Globals that exist in a browser and not on Hermes. */
const BROWSER_ONLY = [
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'navigator',
  'XMLHttpRequest',
  'alert',
]

/** Layer paths, wherever the app lives in the workspace. */
const app = (layer) => `apps/*/src/${layer}/**/*.{ts,tsx}`

export default defineConfig([
  // `components/` is an unreferenced React Aria registry dump: nothing under
  // `src` imports it, and its own `@/lib/react-aria-utils` import does not
  // resolve (the Vite alias points `@` at `src/`, where that file does not
  // exist). It is neither built nor type-checked, so linting it only produces
  // noise. Delete it, or wire it in and drop this ignore.
  // `crypto/openmls-pkg` is wasm-pack output — generated, never committed.
  globalIgnores(['**/dist', 'apps/web/src/components/ui', 'crypto/openmls-pkg']),
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
    rules: {
      // The codebase already treats console logging as something to opt into
      // deliberately — 31 of its 32 call sites carry a disable comment. Making
      // the rule real is what gives those comments meaning, and it backs the
      // security constraint in CLAUDE.md about never logging tokens.
      'no-console': 'error',
      // The codebase marks deliberately-unused parameters with a leading
      // underscore (port implementations that ignore arguments, destructured
      // rest patterns). Teach the rule the convention rather than sprinkling
      // disables.
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  {
    // `test/` joined the TypeScript project, and its wasm-loading specs need
    // `node:fs` / `process` — which means `@types/node` is in scope for the
    // whole project, including `src`. Nothing under `src` ships to Node: it
    // runs in a browser today and on Hermes tomorrow, where none of these
    // exist. The type checker can no longer say so, so the linter does.
    files: ['apps/*/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'Not available in the browser or on Hermes. Use import.meta.env.' },
        { name: 'Buffer', message: 'Not available in the browser or on Hermes. Use Uint8Array.' },
        { name: '__dirname', message: 'Node-only. Use import.meta.url.' },
        { name: '__filename', message: 'Node-only. Use import.meta.url.' },
        { name: 'global', message: 'Node-only. Use globalThis.' },
      ],
    },
  },

  {
    // The shared packages compile with `DOM` in lib because `URL`,
    // `URLSearchParams`, `AbortSignal` and `atob` have no smaller lib to come
    // from — see packages/domain/tsconfig.json. These are the globals that
    // admission must not let in: each is browser-only and absent on Hermes,
    // so reaching for one here would quietly make the package unshareable.
    files: ['packages/*/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...BROWSER_ONLY.map((name) => ({
          name,
          message: 'Browser-only, and absent on Hermes. Take it as a port parameter instead.',
        })),
        { name: 'process', message: 'Node-only. Use injected configuration.' },
        { name: 'Buffer', message: 'Node-only. Use Uint8Array.' },
      ],
    },
  },
  {
    // `@pinai/api` drives upload progress through XHR, which React Native
    // also has. It is the one exception to the list above.
    files: ['packages/api/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...BROWSER_ONLY.filter((n) => n !== 'XMLHttpRequest').map((name) => ({
          name,
          message: 'Browser-only, and absent on Hermes. Take it as a port parameter instead.',
        })),
      ],
    },
  },

  boundary(
    [app('domain'), 'packages/domain/**/*.ts'],
    OUTWARD('adapters', 'store', 'presentation', 'routes', 'ioc', 'lib'),
    'The domain depends on nothing. Take what you need as a port parameter ' +
      '(see domain/ports/) and let the IoC container inject the implementation.',
  ),

  boundary(
    [app('adapters')],
    OUTWARD('store', 'presentation', 'routes', 'ioc'),
    'Adapters implement domain ports; they may not reach outward into UI ' +
      'state, the UI itself, or the container that wires them.',
  ),

  // `store/store.ts` is exempt on purpose: it is a composition root, the
  // place where this platform's persistence is wired into the store, and it
  // gets a sibling rather than a copy in a React Native app. The slices are
  // the part that moves to a shared package, so they are what is enforced.
  {
    ...boundary(
      [app('store')],
      OUTWARD('presentation', 'routes', 'ioc', 'adapters'),
      'UI state may depend on the domain, not on the UI or on a concrete ' +
        'adapter — the mobile app will reuse these slices with its own adapters.',
    ),
    ignores: ['apps/*/src/store/store.ts'],
  },

  boundary(
    [app('presentation'), app('routes')],
    OUTWARD('adapters'),
    'Reach for a port via @/ioc rather than importing an adapter directly.',
  ),
])
