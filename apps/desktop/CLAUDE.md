# @pinai/desktop — the Electron shell

The web app (`apps/web`) as its renderer, built with `import.meta.env.PINAI_DESKTOP`, plus what
only a desktop app can do: keep its session across restarts. Dev only for now
(`pnpm dev:desktop`, :5173 like the web app).

## Main process (`src/main`)

- **One instance**: `requestSingleInstanceLock`; a second launch focuses the first.
- **Signing in, in the window** (`navigation.ts`): the IdP's pages load in the app's own window,
  as they do in the web app's tab. The renderer asks (`sign-in`) and the main process loads the
  `/authorize` URL itself, remembering that IdP. `will-navigate` / `will-redirect` let the window
  go to the app's origin and that IdP only; the IdP's answer to `io.github.pina-i:/callback` —
  its redirect after the sign-in, or "← Another home" — loads the app's `/callback`, where the
  PKCE `state` check rejects a forged one. No OS deep link, no scheme registration. Mobile
  differs: the system auth sheet (`ASWebAuthenticationSession`, Custom Tabs) stays over the app.
- **The session** (`session.ts`): the refresh token the page hands over once, sealed with
  `safeStorage` into `userData/session`. Renewals run here (`renewSessionUseCase`, the same as
  the web's), one at a time; the page gets access tokens only. Sign-out revokes the token at the
  IdP (`/revoke`), then deletes the file. Without a keychain (`basic_text` on Linux) it is kept
  in memory only. Sync `safeStorage` behind a bounded wait for availability: the async API waits
  on the XDG portal, which may never answer. A token is forgotten only when the IdP refused it,
  never because the keychain wasn't ready.
- **IPC** answers the renderer's own origin only: `session:hold`, `session:renew`,
  `session:sign-out`, `sign-in` (`http(s)` only).

## Preload (`src/preload`)

`window.pinaiDesktop` — `session.{store, renew, clear}`, `signIn` — exposed to the app's own
origin only (`--pinai-app-origin`), never to the IdP's pages in the same window. CommonJS:
sandboxed preloads can't be ES modules. Its shape is
`apps/web/src/adapters/desktop/desktop-bridge.ts`, kept in step by hand.

## Development

- The workspace packages are bundled into the main process (`externalizeDeps.exclude`): they
  are TypeScript sources.
- `test/` (vitest): the navigation rule, the session store and `MainSession`, `electron`
  mocked.
- To drive the app without a screen: a headless sway (`WLR_BACKENDS=headless sway`) and
  `--ozone-platform=wayland`; Ozone's own headless platform crashes Electron.
