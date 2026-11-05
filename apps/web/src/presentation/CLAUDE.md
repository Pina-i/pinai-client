# Presentation Layer

This directory contains all UI pages and their associated components.

## Component Organization

For reusable components, we use the Atomic design folder architecture

### Page-specific components

Each page component should be broken down into smaller, focused React components. When a UI section of a page can be isolated, extract it into its own component inside a subfolder of that page's directory.

Example:
```
pages/
  dashboard/
    Dashboard.tsx
    DashboardHeader/
      DashboardHeader.tsx
    FleetOverviewCard/
      FleetOverviewCard.tsx
    RecentActivityList/
      RecentActivityList.tsx
```

### **IMPORTANT** Reusable components

If a component is not specific to its page and could be reused elsewhere, do not keep it in the page's subfolder. Instead, move it to the appropriate level of the Atomic Design hierarchy as defined in the project root CLAUDE.md.
Before creating a new reusable component, check if a similar one already exists in the Atomic Design folders.

## Reusable components creation guidelines

- Whenever it is possible, use React Aria components instead of custom implementations.
- Use tv() function from tailwind-variants to define component variants.
- Use Shadcn theme tokens architecture for component styling.
- Create custom declarative props to not coupling the reusable components to specific UI libraries (e.g. React Aria).

## Layering (z-index)

The film grain covers everything, overlays and the splash included. It is one element for the whole document, static in `index.html`, so no page renders it (`Backdrop` is the ambient wash only). The scale lives in `index.css`:

| Token | Value | For |
|---|---|---|
| `--z-overlay` | 100000 | Popovers, menus, dropdowns, tooltips, modals |
| `--z-titlebar` | 100001 | The desktop app's title bar (`organisms/TitleBar`) |
| `--z-splash` | 100005 | The splash screen, over the app and its overlays |
| `--z-grain` | 100010 | The grain |
| `--z-above-grain` | 100011–100019 | The rare element that must stay clean of the grain (toasts) |

- `--z-overlay` is React Aria's own value: it stamps `zIndex: 100000` inline on every popover and tooltip. Don't give those a z-index class — it would lose to the inline style anyway. Only overlays React Aria doesn't position (`ModalOverlay`, a hand-rolled fixed layer) take `z-(--z-overlay)`.
- Stacking inside a panel stays local and small (`z-[1]`…`z-40`).
- When upgrading `react-aria`, check that `useOverlayPosition` still uses 100000.

## Window frame (desktop)

The desktop app has no system title bar: `.pn-titlebar`, static in `index.html` so it is there from the first paint, draws one, `--titlebar-height` tall, and the system's buttons sit over its end; `<TitleBar />` (rendered from `main.tsx` when `IN_DESKTOP_APP`) colours those buttons like it. The desktop's main process draws the same bar over the IdP's pages (`apps/desktop/src/main/window-frame.ts`): change both together. `--titlebar-height` is `env(titlebar-area-height, 0px)`, so it is 0 in a browser tab and in a macOS full screen.

- `#root` is padded by the bar's height, so pages start under it.
- A full-height page uses `h-app` / `min-h-app`, never `h-screen` / `min-h-screen`: they leave the bar's height out.
- A fixed full-window layer starts at `top-(--titlebar-height)` (`Modal`'s overlay, the splash).
- Anything pressable inside `.pn-titlebar` must stay a real `a` / `button` / `input`: the bar is a drag region, and only those opt out of it.

## Appearance

`providers/AppearanceProvider` sits at the root (`main.tsx`) and owns the appearance through `useAppearance()`: the palette and motif (account settings), the mode preference (`system | dark | light`, this device's), and the mode actually painted, with `system` resolved against `prefers-color-scheme` and followed live.

- The theme lives on `<html>`: `data-theme="family-mode"` selects the palette's tokens in `index.css`, and the `dark` / `light` class selects the mode (the `dark:` variant, `--motif-opacity`, `color-scheme`). `index.html` sets both before first paint from the same `localStorage` keys, so a reload never flashes the default.
- Every change — `setAppearance`, `setModePreference`, or the OS flipping under `system` — commits inside a view transition, so the page cross-fades (`::view-transition-*` timing in `index.css`). With reduced motion, or without the API, it applies instantly.
- Tokens are scoped by `data-theme`, and `@theme inline` makes utilities read them directly, so any element can preview another theme by carrying its own `data-theme` (see `ThemePreview`). Don't use the shadcn aliases (`bg-card`, …) there: they resolve on `:root`.
- `<Motif>` draws the chosen motif unless given one; the SVGs in `assets/motifs/` are masks, so the colour comes from a token.

## Splash screen

A full-page loading state doesn't draw a loader: it holds the splash. A loader inside a panel renders `<RiseLoader title? host? />` (atoms), the same loader the splash shows.

- The splash is static markup in `index.html`, outside React, so it is the first paint of every page load: `<RiseLoader />` alone for the app, or inside `<AuthShell>` for the landing (`/`), so its loader sits where the page's panel will be. `test/rise-loader.spec.ts` fails if either copy drifts from the components; regenerate it from `renderToStaticMarkup` when `AuthShell` changes.
- Its loop carries across page loads (`pn-splash-t0` in `sessionStorage`), through the sign-in redirect. The landing's Continue doesn't hand a loader over: it shows the hand-off screen, and the next page is the IdP's own.
- `index.html` preloads the faces it paints first, so a page load's first frame doesn't draw in a fallback face.
- `main.tsx` holds it until the router has rendered the first location. A screen still loading then holds it too, with `useHoldSplashScreen(isLoading)`: `CallbackPage` while the code is exchanged, the `_authenticated` gate while it probes. The last release fades it out (`_libs/splash-screen.ts`).
- Holds hand over within one commit, so going from one loading screen to the next never uncovers the page.
- After boot, a hold longer than 150 ms brings the splash back, for at least 600 ms. `reshow: "never"` only extends a splash that is up, for work that also runs long after boot (the deferred message list).

## This device and its session

- `_libs/session-device.ts` — once per page load, from `requireSession`, it runs `startThisDeviceUseCase`: the device registers again when it has to (near its attestation's end, or no HPKE key yet), names itself on the session — after a failed registration too, which the KeyPackage tick tries again (`use-replenish-key-packages.ts`) — then its words are checked against the account's history key, a pending key settled first. Tried again at the next route when the IdP is out of reach.
- **The onboarding gate** (`hooks/useIdentityOnboardingGate.ts`, over the domain's `gateThisDeviceUseCase`; `_libs/gate-pages.ts` maps its answers to routes, `_libs/admission-deps.ts` wires what it reads): only a device that is in reaches the app. A pending key or no key ever seen → setup; out and never holding the account's words → the new-device page (`/onboarding/recovery-restore`); out with words that no longer give the key → the reset page (`/onboarding/history-reset`). It checks as `_authenticated` mounts (the IdP out of reach: on what was last recorded), then in the background: at a route change under it, at most once in 30 s and never while one runs (`routeRechecks`), and at once on `reset-by-unapproved`, `key-replaced` or `approval-key-differs` (`forcesRecheck`). The shell stays meanwhile; the newest check decides, a failed one changes nothing, and one finishing after an unmount or a sign-out is dropped. Everything the app runs — the socket, Welcomes, the fanout, the conversation and presence loads, the flusher (`AppRuntime`), the KeyPackage tick and the Door — mounts only once it is `ready`.
- `RecoverySetupPage` shows the words only once the IdP took generation 1, with a loader until then; a reload while the IdP is out of reach shows the words kept — generation 1 only, nothing pending (`firstWordsShownOffline`). New words a start over set and nobody went past show as `organisms/NewWords` instead. A pending key left fresh (`leave`) is tried again every `PENDING_RECHECK_MS`. Another device's key sends it straight to the page the gate decides, never through `/home`. "Clear history backup" (Settings → Devices) erases the entries only.
- `RecoveryRestorePage` is both pages (`variant`: `new-device`, `reset`), drawn as **Pass** (`templates/PassShell`: "— <instance host>" (`_libs/instance-host.ts`), the title — focused when `titleFocusKey` changes —, the instance's initial as a serif watermark, the motif at `--pass-motif-opacity` (9 % dark, 20 % light: the prototype's, not the app's `--motif-opacity`) fading in from the left over an accent wash, `PassCard` rising in; `molecules/SegmentedTabs`, React Aria `Tabs` as a pill that wraps on a phone, keyboard activation manual so arrows don't open the code tab). It sets the device up on mount (registered, named, no KeyPackage) — a pending key sends it to the setup page (the gate's rule, `pendingKeyRoute`), which settles it and shows its words once set; new words not yet gone past show as `NewWords` —, then reads whether it is in; lacking the words, it reads its key share from then on (`AwaitedShare` over `_libs/accept-share.ts`, on the entry's backoff, none while hidden or while a start over runs, `device_mismatch` signing in again): kept before any approval here, on to `/home`, the restore behind it; refused (a check failed), a line pointing to the 24 words. Tabs: "Another device" (first) / "My 24 words" / "Start over"; on the reset page "That device" / "Its 24 words" / "Start over", its title from `resetCause`. A device already in (Settings → "Restore history") gets no Start over tab and "Bring your history to this device"; on the reset page it goes back to the app. An unknown change shows no tabs: what happened, "Check again", "Start over from here" (the warning in place), signing out; a cause not known yet, "Check again" and signing out; a start over answered `rolled-back`, that only the instance can put the key back, "Check again" and signing out (`ResetNote`). A notice (a conflict, `key-changed`) takes the focus and goes at the user's next action. Red and amber text uses `text-dnd-ink` / `text-idle-ink` (`--dnd-ink`, `--idle-ink`: the hue leaned toward the ink in light themes, for 4.5:1). `?tab=<device|words|start-over>` opens the page on that tab, then leaves the URL. Typed words go through the same restore (`restoreDueHistory`), awaited there. "Sign out" under the card; "Back to Pīna'i" only for a device already in (Settings → "Restore history").
  - `StartOverPanel` — the warning (a device still held warns, and comes back with a code typed here; this device won't see the existing conversations unless one does; "It wasn't me": the device that reset the history won't be approved), "Erase and start over" (`Button` `destructive-outline`; disabled once the code approved the device, a ref against a double press), then the domain's `startOverUseCase` with the token's arrival (`accessTokenArrivedAt`) and the cross-tab lock (`_libs/pending-key-lock.ts`). A password typed too long ago (or a `401` for it) opens `RecentSignInModal` (`useRecentSignIn().ask`) and `startLoginUseCase({ reauthenticate, returnTo: <page>?tab=start-over })`; back, the user presses again. `started-over` shows `organisms/NewWords` (the first device's `RecoveryPassphraseDisplay` — two columns on a phone, no word cut —, Copy (`_libs/copy-passphrase.ts`), Continue dismissing the words); `conflict` / `key-changed` say so and go through the gate (`gateThisDeviceUseCase`), the same page read anew. A failure is an `[e2ee]` warning and a fixed line — or, the start over done meanwhile, its words.
- `hooks/useDeviceFanout.ts` — on each change of what a review reads of the device list (`deviceListKey`: a refetch on focus that changed nothing runs nothing; `device_joined` and `device_approved` only refresh it), of the conversation ids, and on a group held: `syncOwnGroupsUseCase`, one at a time page-wide (`oneAtATime`), conversations or not — the list read again and reviewed by the device itself, untrusted leaves committed out, approved siblings added. While a sibling stays `unclaimed` (its stash not out yet) it runs again after `unclaimedRetryDelay`, and stops once none is left. The trust events (`IE2eePort.onTrustEvent`, `trustSnapshot`) are logged, and read by `hooks/use-trust-events.ts` (with the last review's verdict, `useDeviceVerdict`): Settings → Devices seats the devices waiting (below) and shows a banner for `device-list-refused` in a live region kept mounted; a reset or a changed key is the gate's reset page. `hooks/use-unapproved-device-notice.ts` (in `AppRuntime`) — a device found unapproved the first time (`arrived`), on an acting device only: one discreet sonner toast, keyed by the event, "New device not approved: <label>. Not you? Sign it out." with "Open Devices" (`?settings=devices`, which selects the section even with Settings mounted); once a page load per device, dismissed once the event is withdrawn. `untrusted-leaf`, `handshake-keys-refused`, `share-recipient-refused` and `share-refused` are only logged. With `sharing` (`_libs/key-share-deps.ts`), each acting review also shares the passphrase with the partners the list shows waiting for it.
- **The code handshake** (`identity-provider/specs/e2ee.md § 3.10`; the flows are the domain's `approval-handshake.usecase.ts`, the screens' logic their view models, every swallowed error an `[e2ee]` warning):
  - `organisms/ApprovalDoor` — the Door, mounted by `_authenticated` once the gate is ready, over the domain's `ApprovalAnswering` (`useSyncExternalStore`), which `hooks/use-approval-answering.ts` runs (`useApprovalAnsweringRuntime`, the Door's; one copy, held in the module) and shares with Settings → Devices (`useSharedApprovalAnswering`, `useDoorView`, `useSeats`). It says "asked N ago · <host>" from the request's `createdAt`. Pushes reach it through `registerApprovalHandler`; the list is read again when the socket reconnects, a failed read retried with backoff; a chained poll backs the pushes while a run works, the Door's or a seat's. Working, it can't be escaped (`Modal`'s `isKeyboardDismissDisabled`) and offers Cancel; closing it before answering leaves the request alone. Codes tried are kept for the page load, and `navigator.locks` lets one tab answer a request. Its runs try sharing the passphrase right after (`HandshakeDeps.sharing`); nothing goes until the asker approves back, then the fanout's sync shares.
  - `RecoveryRestorePage/ApproveFromAnotherDevice` — Pass's "Another device" tab: kept mounted on every tab, it runs `ApprovalAsking` once the device is set up (`deviceReady`) with a chained `setTimeout` (`nextDelay`), none while the page is hidden; another tab ends a request nobody answered (`pause`) — one another device answered goes on to its approval —, the tab opening again opens one at once (set up while another tab is open, it asks nothing until then); "New code" after a code that went otherwise than unanswered. The digits shrink under 440 px; device names wrap, this device's icon is its listed kind. Its request ends when it goes, a keepalive `DELETE` on `pagehide`; the hourly budget is the page load's. Approved, the domain's `ApprovedEntry` publishes the KeyPackages once the device is in, asked again on its backoff, none while the page is hidden, a "waiting for your other device" line after 20 s, ended only by `endsTheWait` (`device_mismatch` signing in again); it tells the page (`onApproved`), whose share wait starts its backoff over and leaves the way on to it. The words kept, the restore runs (`_libs/history-restore.ts`): "Approved — bringing your history…", then "Your history is back" for 1.5 s, then `onIn` goes to the app — after `RESTORE_WAIT_MS` (15 s) at most, the restore carrying on behind. In by its partner with no share after `SHARE_WAIT_AFTER_IN_MS`, it goes on without: the app takes the share. A share failing its checks is said, pointing to the words tab, with "Go on without it" for a device let in.
  - `OtpInput` takes `groupSize` (3 + 3), `size` (`sm` for a seat, `lg` for the Door and Pass) and `inline` (the label beside the cells); a digit cleared between two others stays a gap.
- **Settings → Devices** (`pages/home/SettingsModal/DevicesEditor`; the rules are the domain's `models/device-roster.ts`, read through `hooks/use-device-roster.ts`, which the Devices tile shares for its "● N waiting"):
  - The header: "Devices." with "N waiting", the line, "Sign out other devices", and "Restore history" only on a device not holding the current passphrase (`holdsCurrentWords`). No "Pair new". A visually hidden live region says who waits as seats come and go.
  - `WaitingSeat` — on a device that acts, each device waiting, dashed, under the card at the top of the list: its label, "waiting for you", "asked N ago" (its request's `createdAt`) or "paired <date>", "reads nothing of yours until you approve it", "Not mine" (the revoke flow, its recent-password step). While the pane is up, requests are answered inline (`showSeats`: the Door starts nothing): "Type the code <label> shows" (3 + 3), "Approve" — held while `SeatsView.busy` —, "a wrong code ends the request", through the Door's own `ApprovalAnswering` (`answerAt`: its run, codes, lock, poll, timeout; Cancel while it works). A device holding the words but not settled says it can't approve yet. The focus goes to Cancel as the exchange starts, then to the outcome; a wrong code's note is in a live region. Leaving the pane (`leaveSeat`) hands an exchange under way to the Door — the close button does that too —; while it works, Escape doesn't close Settings (`isAnswering`, the footer saying so). "Being answered in the approval prompt." only for a Door run already under way when the pane opens.
  - The passphrase card (`molecules/RecoveryPassphraseCard`), only with the current words: "held by N devices" (devices the verdict approves at its generation), Show / Copy, "Clear history backup" (confirmed, entries only, a recent password); its eyebrow breaks only at a dot.
  - `DeviceCard` — "this device", "revoked", "signed out" ("Last seen …" from `last_seen_at`), "holds history" (approved, at the verdict's generation); "approved by <this device | label | your 24 words>" from the verdict only, none on a device that doesn't act; paired date; short id; Revoke. An out-of-use row dims its icon, name and tags only. Red and amber text in `-ink` tokens; pulses `motion-safe:`.
- **Key shares** (`identity-provider/specs/e2ee.md § 3.11`; the flows are the domain's):
  - `_libs/accept-share.ts` — `acceptWaitingShare`, the page's one call of `acceptHistoryShareUseCase` (`oneAtATime`): the restore page's wait and the app's hook share it, so racing callers keep and approve once; the restore due runs after every attempt.
  - `hooks/use-history-share.ts` (in `AppRuntime`) — a device lacking the words (in by its partner) takes its share at startup, on `history_key_ready` (`registerHistoryKeyReadyHandler`, read whatever the standing says) and when the socket comes back; a device holding them runs the restore left due.
  - `_libs/history-restore.ts` — the page load's `HistoryRestore`, run only once zustand's `persist.hasHydrated()` / `onFinishHydration` says the cache was read back (a failed read never says it), so it outlives the screen that started it. Its messages go into the store through `_libs/replay-restored-history.ts` (`seedDmMessages`, then `applyReaction` for `reactionsToReplay`, one conversation a turn), typed words' path too. The asking page waits for it 15 s at most; the app never does.
  - The indicator in the app is the least intrusive pattern already there: one sonner toast in the corner, keyed (`history-restore`) as `AppUpdateNotice`'s is — "Bringing your history back…" (loading), replaced in place by "Your history is back" (with the count) or by the failure and "tried again the next time Pīna'i starts". Subscribed once a page load in `_libs/history-restore.ts`, outside any component: it shows while the app is mounted (`showRestoreInApp`), and a toast up is settled whatever unmounts.
- `_libs/device-mismatch.ts` — `signInAgainOnDeviceMismatch(error)` for a `catch` around a registration or the naming (`session-device.ts`, both onboarding pages): the app revokes its own session and signs in again, once a page. The tick's renewal goes through it too. The flow is the domain's (`sign-in-again.usecase.ts`).

## ViewModel pattern

When a component has non-trivial logic (state management, data transformation, side effects, computed values), extract it into a dedicated `ComponentName.viewmodel.ts` file alongside the component.

The viewmodel exports a custom hook (e.g. `useDashboardHeaderViewModel`) that encapsulates all logic and returns the data/handlers the component needs. The component itself should remain purely presentational, only consuming what the viewmodel provides.

Do not create a viewmodel for simple components that only receive and display props.

When a page component has sub components, each sub component should have its own viewmodel if it has non-trivial logic.

## **IMPORTANT** Guidelines

- Prefer small, single-responsibility components over large monolithic page components
- A page component should mainly compose its sub-components and handle page-level state/data fetching
- Keep presentational logic separated from business logic
- Use Tailwind CSS with Shadcn-style token system for styling when you design new pages
- Use Tanstack query for data fetching and caching
- Do not use directly React Aria components in the pages folder.
- **Everytime you building UI**, check if a React Aria component could fit the need. If that's the case, create a reusable component based on it, respecting the Atomic design folder architecture.
