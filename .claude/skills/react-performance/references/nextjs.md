# Next.js and Server Components

Only for a project rendered on the server — Next.js, React Server Components, Server Actions, SSR and
hydration. A single-page app (Vite) has none of it: skip this file.

## 3. Server-side performance (HIGH)

### Authenticate Server Actions like API routes

Every `"use server"` function is a public endpoint. Authenticate AND authorize inside the action — never
rely on the calling Client Component's gating.

```ts
"use server";
export async function deleteUser(formData: FormData) {
  const session = await getSession();
  if (!session?.user) throw new Error("Unauthorized");
  const targetId = String(formData.get("id"));
  if (session.user.role !== "admin" && session.user.id !== targetId) {
    throw new Error("Forbidden");
  }
  await db.user.delete({ where: { id: targetId } });
}
```

### `React.cache()` for per-request deduplication

```ts
import { cache } from "react";

export const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});
```

`React.cache` dedupes within a single request. Calling `getUser("1")` from three Server Components in the
same render = one DB query.

### LRU cache for cross-request data

For data that does NOT change per request (config, lookup tables), cache outside React with an LRU cache
or `unstable_cache`.

### Avoid duplicate serialization in RSC props

When a Server Component renders the same data into multiple Client Components, the data is serialized
once per consumer. Lift the Client Component up and pass children.

### Hoist static I/O to module scope

```ts
// CORRECT — runs once at module load
const fontData = readFileSync(fontPath);

export async function Page() {
  return <Banner font={fontData} />;
}
```

### No mutable module-level state in RSC/SSR

Module state on the server is shared across all requests — a race condition between users. Use
request-scoped storage (`headers()`, `cookies()`, async context) instead.

### Minimize data passed to Client Components

Only serialize what the Client needs. Strip fields, paginate, project columns at the DB layer.

### Use `after()` for non-blocking work

Next.js 15 `after()` runs work after the response is sent — logging, cache warming, analytics.

```ts
import { after } from "next/server";
export async function GET() {
  const data = await getData();
  after(() => logAnalytics(data));
  return Response.json(data);
}
```

## Waterfalls: Server Components run in parallel through composition

```tsx
// INCORRECT — sibling awaits run sequentially inside one component
export default async function Page() {
  const user = await getUser();
  const cart = await getCart();
  return <View user={user} cart={cart} />;
}

// CORRECT — split into children, React runs them in parallel
export default async function Page() {
  return (
    <View>
      <UserSection />
      <CartSection />
    </View>
  );
}
```

## Bundle size, the Next.js way

- **Optimize Package Imports** (Next.js 13.5+) automates direct imports for the packages it lists
  ([docs](https://nextjs.org/docs/app/api-reference/next-config-js/optimizePackageImports)); manual direct
  imports are still required for the others.
- **Heavy components**: `next/dynamic` instead of `React.lazy`:

  ```tsx
  import dynamic from "next/dynamic";

  const HeavyChart = dynamic(() => import("./HeavyChart"), {
    loading: () => <Skeleton />,
    ssr: false, // when client-only
  });
  ```

- **Third-party scripts**: `next/script` with `strategy="afterInteractive"` (default) or `"lazyOnload"`.
- **Tooling**: Turbopack for faster builds and better tree-shaking, `@next/bundle-analyzer` to see the
  first-load JS.

## Hydration

### No-flicker via inline script

For values needed before hydration (theme, locale), inline a `<script>` that sets
`document.documentElement.dataset.*` before React mounts.

### Suppress expected hydration mismatches narrowly

```tsx
<time suppressHydrationWarning>{new Date().toLocaleString()}</time>
```

Use ONLY for known-divergent leaf nodes — never on a tree containing other children.
