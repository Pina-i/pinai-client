# @pinai/desktop — the Electron shell

The web app (`apps/web`) as its renderer, built with `import.meta.env.PINAI_DESKTOP`, plus what
only a desktop app can do: keep its session across restarts. In dev (`pnpm dev:desktop`) its
window loads the web app's dev server, :5173 like the web app; built
(`pnpm --filter @pinai/desktop build`), `app://pinai/`.

## Main process (`src/main`)

- **The app's address** (`app-scheme.ts`): built, the window loads `app://pinai/`, a privileged
  scheme (standard, secure, fetch) the main process serves from `out/renderer` — the file a path
  names, else `index.html`; nothing out of it, nothing for another host; every answer with
  `frame-ancestors 'none'`, since any instance's sign-in pages load in this window.
  **Permanent**: the app's storage (its E2EE device, its message cache) lives under that origin.
  A packaged app ignores `ELECTRON_RENDERER_URL`. Whether a URL is the app's is `isApp`
  (`navigation.ts`): protocol, no userinfo, and host — never `URL.origin`, which Node gives as
  `"null"` for `app:` as for `data:` and `about:`. Navigation, IPC and the preload all ask it.
- **One instance**: `requestSingleInstanceLock`; a second launch focuses the first.
- **Signing in, in the window** (`navigation.ts`): the IdP's pages load in the app's own window,
  as they do in the web app's tab. The renderer asks (`sign-in`) and the main process loads the
  `/authorize` URL itself, remembering that IdP. `will-navigate` / `will-redirect` let the window
  go to the app's pages and that IdP only; the IdP's answer to `io.github.pina-i:/callback` —
  its redirect after the sign-in, or "← Another home" — loads the app's `/callback`, where the
  PKCE `state` check rejects a forged one. No OS deep link, no scheme registration. Mobile
  differs: the system auth sheet (`ASWebAuthenticationSession`, Custom Tabs) stays over the app.
- **The session** (`session.ts`): the refresh token the page hands over once, sealed with
  `safeStorage` into `userData/session`. Renewals run here (`renewSessionUseCase`, the same as
  the web's), one at a time; the page gets access tokens only. The password typed again for a
  sensitive action hands over a new token, of a new app session: it replaces the one held, which
  is revoked. Sign-out revokes the token at the IdP (`/revoke`), then deletes the file. Without a keychain (`basic_text` on Linux) it is kept
  in memory only. Sync `safeStorage` behind a bounded wait for availability: the async API waits
  on the XDG portal, which may never answer. A token is forgotten only when the IdP refused it,
  never because the keychain wasn't ready.
- **IPC** answers the app's own pages only (`isApp`): `session:hold`, `session:renew`,
  `session:sign-out`, `sign-in` (`http(s)` only), `updates:status`, `updates:restart`,
  `updates:download`.

## Preload (`src/preload`)

`window.pinaiDesktop` — `session.{store, renew, clear}`, `signIn`,
`updates.{status, onChange, restart, download}` (`onChange` listens to `updates:changed`, which
the main process sends the window) — exposed to the app's own pages only (`--pinai-app`,
`isApp`), never to the IdP's pages in the same window. CommonJS: sandboxed preloads can't be ES
modules. Its shape is `apps/web/src/adapters/desktop/desktop-bridge.ts`, kept in step by hand.

## Packaging and updates

- **`electron-builder.yml`**: appId `io.github.pina-i.desktop`, productName `Pinai` — both
  permanent, they name the data folder. `extraMetadata.productName` because dev keeps
  `@pinai/desktop`; `extraMetadata.name: pinai` names the Windows install folder and the
  updater's cache; `desktopName: pinai.desktop` is the window's Linux app_id, matching the menu
  entry.
- **Stable artifact names**, the landing links `Pinai-Setup.exe`, `Pinai.dmg` and
  `Pinai-x86_64.AppImage` (`client-download.ts`); `Pinai-arm64.AppImage` is on the release page
  only, and the Mac's `Pinai-mac.zip` is what the updater reads.
- **The icon**: `build/icon.svg` is the source, `build/icons/` its sizes; every system's comes
  from there. Windows and macOS give the window the app's icon; Linux doesn't, so `index.ts`
  sets the window's (`512x512.png?asset&asarUnpack`, kept out of the archive by `asarUnpack`):
  the taskbar shows it where the desktop reads window icons (KDE does; GNOME needs a menu entry).
- **The AppImage**: `executableArgs: []`, since its AppRun adds `--no-sandbox` only where user
  namespaces are blocked and electron-builder's default would add it everywhere. Its runtime
  needs FUSE 2, which stock Ubuntu lacks; electron-builder's static runtime
  (`toolsets.appimage`) is still beta.
- **Fuses**: `enableCookieEncryption` seals the window's cookies (the IdP's session) with the OS
  keychain. If the IdP's pages ever hang in a packaged Linux app, suspect it first; turning it
  off costs only those cookies, which `prompt=login` never relies on.
- **Signing**: `mac.identity: "-"` and `hardenedRuntime: false` until a Developer ID.
- **`startup.ts`** refuses, when packaged, the switches that open the app to a debugger or hand
  over its traffic (`--remote-debugging-port`/`-pipe`, `--log-net-log`, `--ssl-key-log-file`,
  `--ignore-certificate-errors*`, and `SSLKEYLOGFILE`); the packaged window has no DevTools
  (`devTools: !app.isPackaged`).
- **`updates.ts`** (`AppUpdates`): checks every 6 h and when the device wakes. Windows and Linux
  download, and install on restart or quit; an unsigned Mac only points at `Pinai.dmg`
  (`canInstall` flips once signed). Its IPC `updates:*` answers `isApp` pages only; the page
  reaches it as `pinaiDesktop.updates`.
- **CI** packages the `out/` of the check job on each system's runner.

## Development

- Every package is a devDependency, so electron-vite bundles it into `out/main` (electron-updater
  included); the packaged app ships `out/` alone, no `node_modules`.
- `test/` (vitest): the navigation rule, the session store and `MainSession`, `electron`
  mocked; the startup refusal (`startup.spec.ts`) and `AppUpdates` (`updates.spec.ts`, a fake
  updater).
- To drive the app without a screen: a headless sway (`WLR_BACKENDS=headless sway`) and
  `--ozone-platform=wayland`; Ozone's own headless platform crashes Electron.
- The renderer is `apps/web`'s build without its `/oauth-client.json` (`electron.vite.config.ts`
  leaves that plugin out: the app's client is each IdP's own document), at `base: "/"`:
  electron-vite's preset forces `./`, which breaks a reload two levels deep under `app://`. Its
  CSP comes with it (`apps/web/vite-plugins/content-security-policy.ts`); dev has none. Turbo
  never caches the build: its renderer comes from outside `apps/desktop`.
- The built app and the dev app share `userData`: run the built one on a profile of its own, after
  fetching Electron's binary (`pnpm dev:desktop` does it; pnpm skips its postinstall):
  `pnpm --filter @pinai/desktop exec install-electron`, then
  `XDG_CONFIG_HOME=$(mktemp -d) pnpm --filter @pinai/desktop exec electron . --password-store=basic`.
