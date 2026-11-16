---
name: react-performance
description: React performance rules adapted from Vercel Engineering's React Best Practices — waterfalls, bundle size, client data fetching, re-renders, rendering, JavaScript — for React 18/19 apps, single-page apps (Vite) first, with Next.js and Server Components in a reference of their own. Use when reviewing or refactoring React code for performance, diagnosing slow loads or interactions, or when a spec states a performance requirement (a list size, an update rate).
metadata:
  origin: ECC
---

# React Performance

Performance rules for React 18/19, adapted from [Vercel Labs `react-best-practices`](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices)
(MIT, v1.0.0), sorted by priority. This file is the index: each category is a reference of its own, read
only when the code at hand needs it.

## When to open it

- reviewing or refactoring code on a hot path: a long or growing list, an effect, a state updated at high
  frequency, a new data fetch, a heavy import;
- diagnosing a slow load, a slow interaction, high CPU on the client, a Web Vitals regression;
- a spec that states a performance requirement — then it is a test case like any other.

**Not to optimize on speculation.** A memo, a split or a cache no measurement and no requirement asks for
is code to maintain for nothing. With the echoes-dev-front plugin, the reviewers open this skill when a
diff touches a hot path, and `tdd-developer` only for a test case about performance.

## Priority index

| Priority | Category | When it matters | Read |
|---|---|---|---|
| 1 — CRITICAL | Eliminating waterfalls | Anytime `await` is followed by an independent `await` | [references/waterfalls.md](${CLAUDE_SKILL_DIR}/references/waterfalls.md) |
| 2 — CRITICAL | Bundle size | First-load JS, route-level imports, third-party libs | [references/bundle-size.md](${CLAUDE_SKILL_DIR}/references/bundle-size.md) |
| 3 — HIGH | Server-side | RSC, Server Actions, API routes, SSR — **server-rendered apps only** | [references/nextjs.md](${CLAUDE_SKILL_DIR}/references/nextjs.md) |
| 4 — MEDIUM-HIGH | Client-side data fetching | TanStack Query / SWR / raw `fetch` in hooks, global listeners | [references/client-fetching.md](${CLAUDE_SKILL_DIR}/references/client-fetching.md) |
| 5 — MEDIUM | Re-renders | High-frequency state updates, parent-child fan-out | [references/re-render.md](${CLAUDE_SKILL_DIR}/references/re-render.md) |
| 6 — MEDIUM | Rendering | Long lists, animations, conditional render | [references/rendering.md](${CLAUDE_SKILL_DIR}/references/rendering.md) |
| 7 — LOW-MEDIUM | JavaScript | Hot loops, frequent allocations | [references/javascript.md](${CLAUDE_SKILL_DIR}/references/javascript.md) |
| 8 — LOW | Advanced patterns | Effect events, stable refs | [references/advanced.md](${CLAUDE_SKILL_DIR}/references/advanced.md) |

## How to use it

- **Open only the categories the code touches**, and in them only the rules that match — never all of it.
- **Weigh a finding by its priority.** A CRITICAL or HIGH pattern on a hot path is worth fixing; a LOW one
  is worth it in a hot loop only, and readability wins elsewhere.
- **A project with the React Compiler** memoizes for itself: the manual memoization rules of *Re-renders*
  become review-only.
- **A project rendered on the server** (Next.js, Server Components) also reads
  [references/nextjs.md](${CLAUDE_SKILL_DIR}/references/nextjs.md): server-side rules, the Next.js
  equivalents of the bundle rules, hydration. A single-page app skips it.

## Web Vitals mapping

| Metric | Most relevant categories |
|---|---|
| **LCP** (Largest Contentful Paint) | Waterfalls, Bundle size, resource hints (Rendering) |
| **INP** (Interaction to Next Paint) | Re-renders, Rendering, JavaScript |
| **CLS** (Cumulative Layout Shift) | Rendering, Suspense placement (Waterfalls) |
| **TBT** (Total Blocking Time) | Bundle size, JavaScript, deferred third-party scripts |

## Attribution

Adapted from Vercel Labs `react-best-practices` skill (MIT License, copyright Vercel Engineering, v1.0.0
January 2026). Source:
[https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices](https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices).
This version splits the catalog into one reference per category and keeps the server-rendering rules
apart; for the full original ruleset with extended examples, see the upstream repository.
