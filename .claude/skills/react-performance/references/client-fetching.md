# 4. Client-side data fetching (MEDIUM-HIGH)

## SWR / TanStack Query for deduplication

Multiple components calling `useUser(id)` should share one network request and one cache entry. Use
TanStack Query or SWR — never roll your own `useEffect` + `fetch` for shared data.

## Deduplicate global event listeners

```tsx
// INCORRECT — every component adds its own
useEffect(() => {
  window.addEventListener("scroll", handler);
  return () => window.removeEventListener("scroll", handler);
}, []);

// CORRECT — single shared listener via a hook + global subject
const useScroll = createScrollHook(); // singleton subject under the hood
```

## Passive listeners for scroll

```ts
window.addEventListener("scroll", handler, { passive: true });
```

Improves scrolling smoothness; the listener cannot `preventDefault()`.

## localStorage: version + minimize

- Always store a `version` field; bump on schema change and migrate or discard old data
- Keep payloads small — `localStorage` is synchronous and blocks main thread
