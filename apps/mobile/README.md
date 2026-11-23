# Pīna'i mobile

The Pīna'i app for Android (iOS later), built with [Expo](https://expo.dev) (SDK 58) and Expo
Router. It runs as a development build, not in Expo Go: it carries native code of its own
(Unistyles, and later the MLS engine and the sign-in's callback scheme).

## Set up a Linux machine once

- The Android SDK with platform 36, its build tools and the emulator — Android Studio installs
  them (`~/Android/Sdk`).
- A JDK for Gradle: Expo asks for 17; Android Studio's own (`/opt/android-studio/jbr`, 21) builds
  it too.
- In your shell (`~/.zshrc`):

  ```sh
  export ANDROID_HOME=$HOME/Android/Sdk
  export JAVA_HOME=/opt/android-studio/jbr
  export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
  ```

## Run it

On a phone: turn on **Developer options → USB debugging**, plug it in, check it shows in
`adb devices`. Or start an emulator. Then, from the repository's root:

```sh
pnpm android:mobile   # forwards Metro and Alice's port, then builds, installs and starts Metro
```

It stops at once when no phone or emulator is connected.

The app carries the MLS engine as a native Rust library, which `android` builds first (`pnpm
android:mobile` does): a minute or two the first time, then only when the Rust sources changed.
It needs, once:

```sh
rustup target add aarch64-linux-android x86_64-linux-android
cargo install cargo-ndk --locked
```

and an Android NDK (Android Studio → SDK Manager → SDK Tools → NDK, found under `$ANDROID_HOME/ndk`,
or set `ANDROID_NDK_HOME`). The script names whatever is missing. `pnpm --filter @pinai/mobile
native-mls --force` rebuilds it regardless.

An emulator is started from Android Studio's Device Manager, or with `emulator -avd <name>`.

The first build compiles the native code (a quarter of an hour). After that, `pnpm dev:mobile`
starts Metro alone, and changes to the JavaScript reload in place; rebuild only when a native
dependency or `app.config.ts` changes. Metro's QR code points at the computer's Wi-Fi address:
the phone must be on the same Wi-Fi. Over USB instead, `pnpm dev:mobile --localhost` and
`adb reverse tcp:8081 tcp:8081` (the build sets it up; again after replugging).

Gradle and the emulator together want a lot of memory: if the build's daemon dies, close the
emulator while it builds, or give Gradle fewer workers (`--max-workers=6` in
`android/`'s `./gradlew assembleDebug`).

### A local instance

The phone's `localhost` is not the computer's. `adb reverse` makes it so, for the emulator and a
USB phone alike, so the instance keeps the address it was set up with. From the repository's root,
for every phone and emulator connected — again after one restarts or is plugged back:

```sh
pnpm reverse:mobile        # Metro (8081) and Alice's instance (8088)
pnpm reverse:mobile 8090   # Metro and an instance on another port
```

Only the development build may use plain HTTP; a release build refuses it. Signing in needs an
instance recent enough to serve `/clients/mobile.json` (`curl <instance>/clients/mobile.json`
answers it): type its address in "Your
server" (`localhost:8080`), and its pages open in the system's sheet. A phone running a build from
before a native dependency was added shows a red error on reload: build again.

## Generated files

- `pnpm themes` — `src/theme/themes.generated.ts` from `design-system/tokens.json`, a copy of the
  Pīna'i Design System's tokens (its `project/ds/…/tokens.json`). Colours become hex, as a browser
  paints the `oklch`; what the design system leaves to components (the popover, the light themes'
  inks, the grain, the motif's opacity, the ambient wash) follows the web's `apps/web/src/index.css`
  and is written into `scripts/theme-tokens.mjs`. Run it again when either changes.
- `pnpm assets` — from `design-system/motifs/` (the web's motif SVGs) and the desktop's icon
  (`apps/desktop/build/icon.svg`): the motif tiles in `assets/motifs/` with their index
  `src/presentation/atoms/motif/tiles.generated.ts`, and the app icon, its Android layers and the
  splash in `assets/icon/`.

All of them are committed. `android/` and `ios/` are not: Expo's prebuild generates them from
`app.config.ts`.

## Checks

From the repository's root, `pnpm lint`, `pnpm typecheck` and `pnpm test` include the app.
`pnpm dlx expo-doctor` in this folder checks the dependencies against the SDK.

The fonts' licences (SIL Open Font License) are in `assets/licenses/`.
