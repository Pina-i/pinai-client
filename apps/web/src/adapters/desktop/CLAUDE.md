# Desktop adapters — the renderer's half

Used when the renderer is built for the desktop app (`import.meta.env.PINAI_DESKTOP`); the IoC
picks them over the browser's. Their other half is the main process (`apps/desktop`).

- `desktop-bridge.ts` — `window.pinaiDesktop`, as the desktop's preload exposes it to the app's
  own pages.
- `auth-navigation-desktop.adapter.ts` — the IdP's pages load in the app's own window through the
  main process (`signIn`), which catches the answer to `io.github.pina-i:/callback`; the client
  is each IdP's `/clients/desktop.json`.
- `session-token-desktop.adapter.ts` — the refresh token goes to the main process once, after
  the code exchange; `take` answers nothing, since renewals run there (`getSessionRenewal` in the
  IoC asks it), and `clear` revokes it.
