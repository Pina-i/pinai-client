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
- **One instance**: `requestSingleInstanceLock`; a second launch shows the first, hidden or not
  (`showApp`), and exits — where no tray host exists (GNOME without the AppIndicator extension),
  the way back to a hidden window. The sign-in never comes that way: its callback is caught in the
  window, no scheme is registered. On Wayland, what lets KWin give the shown window focus is an
  activation token: Electron passes the second launch's `XDG_ACTIVATION_TOKEN` on to the first,
  and Plasma hands the tray's click one (`ProvideXdgActivationToken`). A launch from a terminal
  has none: the taskbar entry may only flash.
- **Closing the window** (`keep-running.ts`, `tray.ts`): while this device's choice is on
  (`KeepRunningChoice`, `userData/keep-running.json`, written aside then renamed; a write that
  fails is refused to the page, which says so), `close` hides the window (`AppLifecycle`,
  `closeAction`) and the app runs on, its socket connected. On by default, but off on GNOME
  (`XDG_CURRENT_DESKTOP`, `keepRunningByDefault`), which shows no tray icon without the
  AppIndicator extension; a saved choice wins. Windows and Linux get a tray icon (`AppTray`): left
  click shows the window, its menu "Show Pīna'i" / "Quit", its tooltip and dot the badge's count
  (`AppBadge`'s `onCount`, `trayLook`). macOS has no icon: the Dock's `activate` shows the window;
  a macOS full screen is left before hiding. `window:keep-running` also answers how the window
  comes back (`comesBackBy`: the tray, the Dock, or launching again on GNOME), for Settings'
  wording. Off, closing quits, and on macOS leaves the app in the Dock as before. A quit under way
  lets the window go: `before-quit` (Ctrl+Q / ⌘Q, the tray's Quit, `app.quit()`, SIGTERM —
  Electron's handler calls `Browser::Quit` —, a macOS logout) and `before-quit-for-update` set
  `quitting`, which never resets; it only stops a new window opening (`showApp`), so a quit a
  future `beforeunload` cancelled leaves the tray, the Dock and a second launch working. A
  sign-in started while hidden — a session ended elsewhere — shows the window without focus
  (`showForSignIn`). A renderer gone for any reason but `clean-exit` reloads the app's page, once
  a minute at most (`reloadsAfterCrash`). Windows' session end needs nothing: Electron ends the
  process on `WM_ENDSESSION` unless a quit is under way, and answers `WM_QUERYENDSESSION` yes;
  starting a quit there would cancel that, and could run the updater's installer as the session
  ends. Nothing listens to `powerMonitor`'s `shutdown`, which
  would take a logind delay lock. The tray is destroyed and the badge cleared at `will-quit`.
  Ctrl+Q: `appMenu` is Electron's default menu, which the window never shows on Windows and Linux,
  with Quit on Ctrl+Q there too ("Exit" has none on Windows). The window keeps Chromium's
  background throttling: hidden, the 30 s heartbeat slows to one a minute at worst, well inside the
  IdP's 10 minutes before `away`, and the page reports itself hidden, so messages count.
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
- **The window frame** (`window-frame.ts`): no system title bar (`titleBarStyle: "hidden"`); the
  page draws its own (`apps/web/index.html`'s `.pn-titlebar`, 32px) and the system keeps its buttons
  over it — the traffic lights on macOS, a window controls overlay on Windows and Linux, whose
  `titlebar-area-*` CSS variables size the page's bar. The page sends its `--background` and
  `--muted-foreground` as hex at each palette or mode change (`window:title-bar`, checked by
  `titleBarColors`): they colour the overlay (not on macOS) and the window's background, and are
  kept in `userData/title-bar.json`, so a launch opens in the theme it closed in (Black Pearl dark
  without one). The IdP's
  pages draw no bar: `dom-ready` inserts the same one into theirs (`IDP_TITLE_BAR`, pseudo-elements
  coloured by their tokens — the IdP's palettes are the app's — the mark as masks from
  `title-bar-mark.ts`) and steps their `body` down by its height. Keep it like `.pn-titlebar`.
- **The badge** (`badge.ts`): the page's attention count (`apps/web`'s `hooks/use-attention.ts`;
  the window's title is the page's `document.title`, which nothing here overrides) on the app's
  icon. `window:badge` takes a non-negative integer, capped at `MAX_BADGE_COUNT`, and a PNG data URL
  or null (`badgeOf`); `badgeAction` decides per system: `app.setBadgeCount` on macOS (the Dock)
  and Linux, where Electron 44 emits the
  `com.canonical.Unity.LauncherEntry` `Update` signal itself, no libunity, for
  `application://<desktopName>` — `pinai.desktop` packaged, the menu entry's; in dev
  `pinai-desktop.desktop`, which no entry matches, so no badge. Windows takes the page's picture
  as the taskbar button's overlay (`setOverlayIcon`). Shown on change only, never throwing;
  cleared at 0, at each page load (`did-navigate`), when the renderer crashes
  (`render-process-gone`), at sign-out, when the window closes and at quit (`clearWhenPageGoes`);
  Windows' overlay laid again at the window's `show` and `focus` (`repaint`): Windows drops a
  hidden window's overlay with its taskbar button, which may not be back yet at `show`.
  Unverified on a Mac: Electron's docs say the Dock badge needs the notification permission, which
  the app never asks for — deliberately, no prompt for it.
- **IPC** answers the app's own pages only (`isApp`): `session:hold`, `session:renew`,
  `session:sign-out`, `sign-in` (`http(s)` only), `updates:status`, `updates:restart`,
  `updates:download`, `window:title-bar`, `window:badge`, `window:keep-running`,
  `window:set-keep-running` (a boolean, `keepRunningOf`; a failed write refused).

## Preload (`src/preload`)

`window.pinaiDesktop` — `session.{store, renew, clear}`, `signIn`,
`window.{paintTitleBar, setBadge, keepRunning, setKeepRunning}`, `updates.{status, onChange, restart, download}` (`onChange` listens to `updates:changed`, which
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
- **The tray's icons** (`build/tray/`, made by its `make.sh` from `icon.svg`, ImageMagick with
  librsvg): plain and with the dot. Windows takes the `.ico` (16–48 px, 32-bit), loaded by its
  path at the DPI's size, so unpacked (`*.ico` in `asarUnpack`); only a PNG's 1x would reach it.
  Linux takes the 48 px PNG: Electron sends the panel its largest picture as one pixmap
  (StatusNotifierItem), which KDE scales to 22–24 px, or 44–48 on HiDPI.
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
- **`menu-entry.ts`**: each launch of the packaged AppImage (Linux, `APPIMAGE` and `APPDIR` set,
  not an extracted one) syncs `$XDG_DATA_HOME/applications/pinai.desktop` and its icons, silently;
  `userData/menu-entry` records the path written. First launch writes; a moved file rewrites,
  keeping `NoDisplay=`/`Hidden=`, and only if the entry carries `X-Pinai-AppImage=true`; an entry
  the user removed stays gone; a foreign `pinai.desktop` is untouched; a deleted AppImage hides
  its entry through `TryExec=`. Refuses a relative path or one with `"` `` ` `` `$` `\` `%` or a
  control character; swallows every error.
- **CI** packages the `out/` of the check job on each system's runner.

## Development

- Every package is a devDependency, so electron-vite bundles it into `out/main` (electron-updater
  included); the packaged app ships `out/` alone, no `node_modules`.
- `test/` (vitest): the navigation rule, the session store and `MainSession`, `electron`
  mocked; the menu entry (`menu-entry.spec.ts`, temp dirs); the startup refusal
  (`startup.spec.ts`), `AppUpdates` (`updates.spec.ts`, a fake updater), the badge
  (`badge.spec.ts`), closing and quitting (`keep-running.spec.ts`) and the tray (`tray.spec.ts`).
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
