# @pinai/desktop — the Electron shell

The web app (`apps/web`) as its renderer, built with `import.meta.env.PINAI_DESKTOP`, plus what
only a desktop app can do: sign in through the system browser and keep its session across
restarts. Dev only for now (`pnpm dev:desktop`, :5173 like the web app).

## Main process (`src/main`)

- **One instance.** `requestSingleInstanceLock` first: a deep link launches a second instance
  (Linux, Windows), which hands its argv over (`second-instance`) and quits. macOS sends
  `open-url`. A cold start with the link in its argv delivers it once the window exists.
- **The deep link** (`deep-link.ts`): only `io.github.pina-i:/callback?…` opens anything — it
  loads the renderer's `/callback` with the IdP's answer, where the PKCE `state` check rejects a
  forged one. Every IdP's desktop document lists that callback.
- **The session** (`session.ts`): the refresh token the page hands over once, sealed with
  `safeStorage` into `userData/session`. Renewals run here (`renewSessionUseCase`, the same as
  the web's), one at a time; the page gets access tokens only. Sign-out revokes the token at the
  IdP (`/revoke`), then deletes the file. Without a keychain (`basic_text` on Linux) it is kept
  in memory only. Sync `safeStorage` behind a bounded wait for availability: the async API waits
  on the XDG portal, which may never answer. A token is forgotten only when the IdP refused it,
  never because the keychain wasn't ready.
- **IPC** answers the renderer's own origin only: `session:hold`, `session:renew`,
  `session:sign-out`, `open-external` (`http(s)` only).

## Preload (`src/preload`)

`window.pinaiDesktop` — `session.{store, renew, clear}`, `openExternal`. CommonJS: sandboxed
preloads can't be ES modules. Its shape is `apps/web/src/adapters/desktop/desktop-bridge.ts`,
kept in step by hand.

## Development

- `scripts/register-scheme.mjs` (run by `pnpm dev`, Linux only) writes
  `~/.local/share/applications/pinai-desktop-dev.desktop` and makes it the `io.github.pina-i:`
  handler (`xdg-mime`), so the browser's redirect reaches the running app. Windows and macOS
  register through `setAsDefaultProtocolClient` in development.
- The workspace packages are bundled into the main process (`externalizeDeps.exclude`): they
  are TypeScript sources.
- `test/` (vitest): the session store and `MainSession`, `electron` mocked.
