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

## The native MLS engine

- **`modules/openmls`** is a local Expo module (Android only) over `crypto/openmls-native`, native
  module `OpenMls`. `android/generated/` (the `.so` per architecture and the uniffi Kotlin) is
  `scripts/build-native-mls.mjs`'s output, gitignored; `android` and `android:device` run the script first.
- Each uniffi object is an Expo `SharedRef`, not a `SharedObject`: Expo requires a JS constructor
  for a `SharedObject` class, and JavaScript makes none of these but `Provider`. Names are the WASM
  facade's: `Constructor` for `Provider`, `StaticFunction`s for the statics, synchronous
  `Function`s for methods, records (outputs, members, HPKE pairs) read through `Property` getters,
  the `ProcessedKind` constant with the WASM's numbers. `free` closes the uniffi object, as does
  Expo releasing it.
- A core error is thrown as a `CodedException`: `ERR_MLS_MALFORMED`, `ERR_MLS_REFUSED` or
  `ERR_MLS_STATE`. Epochs come as numbers (Kotlin `Long`), absent values as `null`: what
  `@pinai/mls`'s engine reads.
- `src/adapters/mls/native-engine.ts`: `nativeMlsEngine()` is `new MlsEngine(…)` over
  `requireNativeModule<MlsBundle>("OpenMls")`, a cast `@pinai/mls/contract` checks at run time.
  `createMlsEngine()` in `src/ioc/index.ts` makes fresh engines.
- `OpenMls.argon2id` is the module's one `AsyncFunction` (the MLS calls are synchronous): the 24 words'
  Argon2id takes a good part of a second, off the JS thread. `src/adapters/crypto/native-argon2id.ts`,
  handed out by `createArgon2id()`; `/dev/argon2-check` (`argon2:check`) plays `@pinai/crypto/contract/argon2`
  on it, each case timed.
- **The control screens** play a contract on the phone: `presentation/pages/dev/contract-check.tsx` (the
  view) and `contract-check.viewmodel.ts` (`useContractCheck(label, scenarios, make, link)`), used by
  `pages/dev/mls-check/` (`@pinai/mls/contract` on `createMlsEngine()`) and `pages/dev/storage-check/`.
  Each route (`src/app/dev/*.tsx`) imports its page behind `__DEV__`, so a release bundle drops it, the
  contracts and fixtures with it. A link to the screen already open changes no route: the view model
  listens for it itself and plays the contract again. It logs `[label] ✗ …` per failure and the
  summary line, which `scripts/device-check.mjs` reads from `ReactNativeJS` for `mls:check` and
  `storage:check` (one device through adb, the app's links, a relaunch on Metro's bundle).
- A release build will need R8 keep rules for JNA and the `uniffi.openmls_native` package.

## The encrypted store

- `createSealedStorage(account)` in `src/ioc/index.ts`: `@pinai/crypto`'s `SealedStorage` (the schema and
  the sealing, the web's) over the phone's two adapters, a store and a key per account
  (`adapters/storage/account-store-names.ts`) — `clear()` wipes the key, which must not erase another
  account's store.
- `SqliteKeyValueStore`: the account's own `expo-sqlite` database, one table of (collection, key, BLOB).
  Two stores over one file share expo-sqlite's native connection; a file is deleted only once every
  store over it is closed.
- `KeystoreDeviceKeyAdapter` over **`modules/device-key`** (native module `DeviceKey`, Android only):
  AES-256-GCM in the Keystore's TEE, not StrongBox (too slow for a snapshot of megabytes), no user
  authentication; seal, open and wipe by alias, off the JS thread. The key is minted only when no entry
  has the alias, so a key that fails to read is never replaced.
- `src/web-crypto.ts`, imported first by `index.ts`: Hermes has no Web Crypto, so `expo-crypto` gives
  the shared code `crypto.randomUUID` and `crypto.getRandomValues`.
- `android.allowBackup: false`: a backup would carry the store, never its key; a new phone is a new
  device to approve.
- **Its proof**, `storage:check` (`scripts/storage-check.mjs`):
  - `/dev/storage-check` plays `@pinai/crypto/contract/storage` on `phoneStorageWorld`.
    `src/ioc/check-stores.ts` gives each scenario's stores names of their own, never the app's, and
    closes then deletes them after. They are built in `src/ioc` because screens may not import adapters.
  - `/dev/storage-restart?phase=write` founds Alice's group with Bob, then saves both MLS states and a
    sealed marker under `restart-check` names, closing the stores but keeping them.
  - The script kills the app and starts it again.
  - `?phase=read` reads everything back and checks Bob reads what Alice writes, then deletes it all.
  - Each phase logs its `[storage-check] restart: …` line whatever happens to the screen: a launch may
    send the app elsewhere.

## This device

- **The account's E2EE core** (`src/ioc/index.ts`): `openAccountE2ee(actorUri)` builds one `E2eeAdapter`
  per account — the native MLS engine (its HPKE too), `createSealedStorage`, `KeyDirectoryApiAdapter`
  with the device's label, the `@pinai/api` ports, `JwksCache` over the kv-store (`kvStrings`), native
  Argon2id for the history key and the code. One at a time: its engine holds the account's groups in
  memory; another account replaces it (the previous account's stores stay open, its files untouched).
  `getE2eePort()` throws before one is open; `getPendingKeyLock()` is the account's `inProcessLock` —
  one process, no tabs, but flows that mustn't overlap.
- **Its name**: `ExpoDeviceFactsAdapter` (`expo-device`) gives the domain's `PhoneFacts` — the model,
  phone or tablet, the name its owner gave it —, which `composeDeviceLabel` turns into "Pixel 9 Pro
  (Kilian's phone)", as the desktop app names a computer.
- `presentation/_libs/this-device.ts` — `enterAccount(actorUri)`: the core opened, then the domain's
  `ThisDeviceStart` (once settled, a run; again at the next call while the IdP is out of reach). Every
  signed-in screen calls it: the gate, and `src/app/onboarding/_layout.tsx`. `_libs/admission-deps.ts`,
  `_libs/device-mismatch.ts` (the domain's sign-in-again rule: the session ended, the system's sheet
  opened again) and `_libs/warn-e2ee.ts` (`[e2ee]` lines in the device's log) are what the flows take.
- **The gate** (`presentation/hooks/use-onboarding-gate.ts`): the domain's `OnboardingGate` — once in,
  checked again at a route change and when the app comes back to the front (`AppState`). The `(app)`
  layout shows nothing of the app before the device is known to be in; a failed check is
  `pages/gate-failed` ("Try again", "Sign out"). Out, it sends the device to `/onboarding/setup`,
  `/new-device` or `/reset` (`GATE_ROUTES`). In by its kept words over a reset it didn't make, the gate keeps why
  (`reset`) and offers `recheck`, handed through `_libs/history-reset.ts` to the banner and its sheet.
  After another account's device was wiped it checks again: the phone keeps no account's messages yet.
- **"New device"** (`/onboarding/new-device`, `pages/onboarding/new-device/`) — and **the reset page** (`/onboarding/reset`,
  the same page, `variant="reset"`, with the web's words: the title by cause or "Your words were replaced on <device>", "That
  device" / "Its 24 words", an unknown change's "What happened", "Check again", "Start over from here", `reset-note.tsx`): the
  domain's `enterRestorePageUseCase` as it opens — the device set up, sent where the gate says, else its ways as a pager
  (`molecules/segmented-tabs`, a swipe or a tab; `?tab=` opens one, and a request of this device's waiting or ended opens
  Start over, `openingTab`). The ways are organisms, the banner's sheet uses them too:
  - **Device** (`organisms/device-way/`, `hooks/use-approval-asking.ts`: the domain's `ApprovalAsking`, ticked only in front,
    paused off the tab; approved, `ApprovedEntry` until in; `molecules/code-cells`; the devices it can be typed on,
    `approvingDevices`).
  - **24 words** (`organisms/words-way/`, `hooks/use-typed-words.ts`: one field, Paste, `wordsOf`, a misspelt word said,
    screenshots blocked on that way).
  - **Start over** (`organisms/start-over-way/`, the domain's `StartOverFlow`; this device's request read by
    `hooks/use-own-start-over.ts` as it opens, every 5 min and back in front, and at the date it matures): the prototype's
    card and its confirmation sheet ("Erase your saved history?"), then the web's stages and words — waiting 7 days with its
    date, ready, another device's first, withdraw, "Approve with another device instead"; the reset page's "It wasn't me"
    (the setter refused, "First, your password"). The password asked again goes through the system's sheet
    (`hooks/use-recent-sign-in.ts`, `molecules/recent-sign-in-sheet`) and comes back to `?tab=start-over`: the user presses
    again. New words → `/onboarding/setup`, which shows them with the devices they left behind (`setup/from-before.ts`:
    the phone answers no code yet, so a device left behind comes back with these words).
  Meanwhile `hooks/use-awaited-share.ts` waits for the key share (`ShareWait`, `_libs/app-visibility.ts`,
  `_libs/accept-share.ts`); kept, on to `/home`. "Sign out" under the ways.
- **Back where the password was asked**: `prepareLoginUseCase`'s `post_login_redirect` is where the callback goes (Welcome's
  sign-in passes `/home`); a cancel asked for the password goes to `returnTo`, and a sheet the user closed to
  `MobileAuthNavigationAdapter`'s `closedTo` (the same, while `reauthenticating`). `_libs/session.ts`'s
  `accessTokenArrivedAt` is how recent the password is, on the IdP's clock.
- **The history-reset banner** (`organisms/history-reset-banner/`, at the top of the home panel): in by its kept words — "Your
  history was reset from a device this one doesn't know…" ("It was me", "It wasn't me") or "Your instance changed your history
  key…" ("Check again", "Start over from here") —, each way a form sheet route, `/history-reset?way=` (`pages/history-reset/`:
  the code or the new words; the password first, then Start over refusing the setter; Start over alone), each end checking
  again. Routes, not `molecules/sheet` (a `Modal`, its own Android window): screenshots stay blocked in the app's window.
- **What runs once in** (`_libs/app-runtime.ts`, started by the `(app)` layout while signed in and `in`, stopped as it
  leaves): `_libs/device-review.ts` — the domain's `syncOwnGroupsUseCase` with no conversation (the phone holds no group:
  the review and the passphrase's shares only), at once, on `device_joined` / `device_approved`, when the socket or the app
  comes back; without it the phone would announce nobody and share with nobody. `_libs/history-share.ts` — a share owed
  taken at once and on `history_key_ready`, the device's own approval by its words made again on a reconnect.
  `_libs/approval-answering.ts` — the app's one `ApprovalAnswering`, kept current by the domain's `AnsweringRuntime`,
  read again when the socket or the app comes back (the socket closes in the background); `useAnswering`, `useDoorView`,
  `useDoorSummons`, `useSeats`, `summonDoor`. `_libs/arrivals.ts` — a device arriving unapproved (`arrivalToTell`) opens
  the Door for it; the web shows a toast. `_libs/socket.ts` hands its one handler of each kind on (`onSocketEvent`,
  `onSocketConnected`, `isSocketConnected`).
- **No history restore yet** (`_libs/history-restore.ts`): the phone keeps no messages, and `HistoryRestore` run with
  nowhere to put them would count the restore applied, then clear it. It isn't run: the restore stays due for when
  conversations come to the phone.
- **"Save your 24 words"** (`/onboarding/setup`, `pages/onboarding/setup/`): the domain's
  `setUpFirstDeviceUseCase` — a loader by stage, then the words; a start over's new words on the same
  screen ("Your new 24 words", no step line, Continue forgetting them: `dismissNewWords`); a pending key tried
  again after its delay; another device's key sent where the gate says; a failure with "Try again". "Start
  using Pīna'i" once the words were shown or copied and "I've saved them somewhere safe" is on, then `/home`,
  whose gate decides. No "Settings › Devices" line: the phone has no Devices screen yet.
- `molecules/sheet` — a sheet from the bottom over a `Modal` (a question: the start over's confirmation, the password asked
  again); never for the words, which a `Modal`'s own window would leave capturable.
- `molecules/words-card` — the 24 words in two numbered columns, blurred until "Show words" (a `filter` blur, which
  Android draws from 12 on: hidden, the cells hold dots, never the words); hidden again when the app leaves the
  front; "Copy words" copies them hidden or not, marked sensitive (`expo-clipboard`'s `android.isSensitive`: no
  preview in Android's overlay nor the keyboards'). While a card is up, screenshots and the app switcher's preview
  are blocked (`expo-screen-capture`, FLAG_SECURE, one key per card). `molecules/switch-row` — a `Group` row that is
  its switch. `app.config.ts` blocks the storage and photos permissions `expo-screen-capture` declares to detect
  screenshots before Android 14 (the app only blocks them); `DETECT_SCREEN_CAPTURE` must stay — from Android 14 the
  library registers its detector as it loads, and the app fails to start without it ("Permission Denial").
