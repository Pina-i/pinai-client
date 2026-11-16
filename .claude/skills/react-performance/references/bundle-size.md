# 2. Bundle size optimization (CRITICAL)

## Direct imports, not barrels

Barrel `index.ts` files force the bundler to walk the entire module graph even when tree-shaking removes
most of it. Direct imports save 200-800ms of first-load JS in many real-world apps.

```ts
// INCORRECT
import { Button, Card, Modal } from "@/components";

// CORRECT
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Modal } from "@/components/Modal";
```

## Statically analyzable paths

```ts
// INCORRECT — defeats bundler/trace analysis
const mod = await import(`./pages/${name}`);

// CORRECT — explicit per branch
const mod = name === "home" ? await import("./pages/home") : await import("./pages/about");
```

## Dynamic imports for heavy components

```tsx
import { lazy, Suspense } from "react";

const HeavyChart = lazy(() => import("./HeavyChart"));

<Suspense fallback={<Skeleton />}>
  <HeavyChart />
</Suspense>
```

Split by route first — a page the user may never open should not be in the first-load bundle.

## Defer third-party scripts

Load analytics, logging and support widgets after the app has rendered: `defer` / `async` on their
`<script>`, or inject them once the first render is done.

## Conditional module loading

```tsx
if (user.role === "admin") {
  const { AdminPanel } = await import("./admin/AdminPanel");
  // ...
}
```

## Preload on hover/focus

Trigger `<link rel="preload">` or `import()` on hover so the bundle is in cache by the time the user
clicks.
