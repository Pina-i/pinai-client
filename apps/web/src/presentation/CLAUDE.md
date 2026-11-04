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
- The onboarding gate sends an account with no history key to setup, a local identity or not — a first device cut short resumes there —, unless this device saw a key before. `RecoverySetupPage` shows the words only once the IdP took generation 1, with a loader until then; a reload while the IdP is out of reach shows the words kept. Another device's key sends it to the restore page. `RecoveryRestorePage` sets the device up on mount and checks the typed words before anything is kept. "Clear history backup" (Settings → Devices) erases the entries only.
- `hooks/useDeviceFanout.ts` — on each change of what a review reads of the device list (`deviceListKey`: a refetch on focus that changed nothing runs nothing; `device_joined` and `device_approved` only refresh it), of the conversation ids, and on a group held: `syncOwnGroupsUseCase`, one at a time page-wide (`oneAtATime`), conversations or not — the list read again and reviewed by the device itself, untrusted leaves committed out, approved siblings added. The trust events (`IE2eePort.onTrustEvent`, `trustSnapshot`) are only logged for now.
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
