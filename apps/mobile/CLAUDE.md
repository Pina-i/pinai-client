# @pinai/mobile

The Expo app (SDK 58, Expo Router, New Architecture), Android first. Design and steps:
`docs/plans/2026-11-20-mobile-app-design.md` (gitignored, like all of `docs/`).

- **One domain for every client.** A business notion useful to more than one client goes in
  `@pinai/domain` (and the web switches to it); only what is the phone's stays here. Same layers
  and lint boundaries as the web (`src/adapters`, `src/store`, `src/presentation`), Expo Router's
  `src/app/` as the routes layer: thin route files rendering a page.
- **Hermes, not a browser**: eslint refuses the browser's globals and Node's under `src/`;
  `process.env.EXPO_PUBLIC_*` is fine (inlined at build time).
- **Expo packages through `pnpm expo install`**, so versions match the SDK. Nitro is pinned to the
  version Unistyles was built against.
- **Styling is Unistyles 3**: `StyleSheet.create((theme) => …)`, never `useUnistyles()` to read
  colours in a component that doesn't need to re-render. The eight themes are named as the
  domain's `ThemeId`; `src/theme/unistyles.ts` picks one (the domain's defaults, dark or light as
  the system is) and follows the system. Configured from `index.ts`, after `expo-router/entry`.
- **Generated, never edited**: `src/theme/themes.generated.ts` (`pnpm themes`),
  `src/presentation/atoms/motif/tiles.generated.ts` and `assets/motifs`, `assets/icon`
  (`pnpm assets`). The README says where their sources come from.
- **Fonts** are embedded by `expo-font` (`app.config.ts`), one Android family per typeface:
  `fontFamily: "DM Sans"` with a `fontWeight`, never a face's file name.
- **Motifs** are PNG masks tinted with a token (`<Motif>`), the grain a GIF animated by
  `expo-image` (`<Grain>`, once, in the root layout, above everything).
- **Signing in** is the domain's flow over the phone's adapters (`src/ioc/index.ts`): the client
  `<issuer>/clients/mobile.json` (`browserSession: false`, as the desktop), PKCE over
  `expo-crypto`, the sign-in's scratch in memory, the refresh token in the keychain (emptied by a
  synchronous write, revoked when cleared), the IdP's pages through `openAuthSessionAsync`. Routes:
  Welcome (`index`, which sends a session to `home`) → `server` (a form sheet) → `opening` →
  the system's sheet → `callback`; `unreachable` at launch. `presentation/_libs/session.ts` wires
  the domain's `SessionKeeper` to `AppState` and the tick, resumes at launch, signs out.
- The store (`src/store/store.ts`, the composition root): the access token in memory, the
  instance signed in to persisted through the kv-store's synchronous half; the chosen status
  (`online` at launch); the account's appearance, read from this phone's settings copy at launch.
- **Reach**: the `(app)` group's layout holds the rail (`presentation/templates/reach/`), so it
  stays while `home` and `settings` change beside it; `status` is a form sheet over them.
- **The account's look**: `presentation/_libs/appearance.ts` settles the account's settings at
  each sign-in or resume (the domain's sync) and on `settings_updated`; the Unistyles theme follows
  the store's palette and the system's mode; `<Motif>` defaults to the account's motif.
- **The socket** (`presentation/_libs/socket.ts`): open while signed in and in front, closed in
  the background; heartbeat 30 s; `1008` renews then reconnects; the chosen status restated once
  connected (`restatePresenceUseCase`).
- No typed routes: they are generated into the gitignored `.expo/`.
- No `android/` or `ios/` in git (prebuild). The debug variants allow cleartext HTTP, release
  doesn't.
- Tests: Vitest in `test/` (node), for what doesn't import React Native.
