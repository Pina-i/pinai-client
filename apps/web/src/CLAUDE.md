# Development Rules

## General Architecture

This project follows a **hexagonal architecture** (Clean Architecture) with strict separation between layers:

Three layers have left this folder and are packages now, depended on like any
other: `@pinai/domain` (models, ports, use cases), `@pinai/api` (the IdP's
HTTP and WebSocket surface) and `@pinai/crypto` (the E2EE core).

What remains under `adapters/` is the part that is genuinely this platform's:
the WASM MLS engine, the WebCrypto device key, IndexedDB, `sessionStorage`
for the PKCE round-trip, `localStorage` for the JWKS TTL, and browser
navigation. That list is the mobile port's inventory.

```
locales/              # Translation files
src/ <- this folder
├── adapters/         # Technical implementations (InMemory, API, etc.)
├── presentation/     # UI layer (Atomic Design)
│   ├── atoms/        # Basic building blocks (Button, Input, Label, etc.)
│   ├── molecules/    # Combinations of atoms (FormField, SearchBar, etc.)
│   ├── organisms/    # Complex UI sections (Header, Form, DataTable, etc.)
│   ├── templates/    # Page layouts and structural components
│   └── pages/        # Application pages (rendered by Tanstack router routes)
├── components/ui/    # Vendored React Aria registry output — staging area,
│                     #   not a library. Unadopted; see its own CLAUDE.md.
├── store/            # Zustand. `store.ts` composes this platform's
│                     #   persistence; `slices/` is the state itself.
├── ioc/              # Where the ports are wired to implementations
├── lib/              # Layer-neutral: view-model types + React Aria helpers
└── routes/           # TanStack Router routes
```

### Dependency principle

- The **domain** depends on nothing (pure TypeScript) — now enforced by it
  being a package with no dependencies, not just by lint
- The **adapters** depend on the domain (implement ports)
- The **presentation** (pages) uses the domain via IoC

These are **enforced by ESLint** (`no-restricted-imports` blocks in
`eslint.config.js`), not merely documented. A crossing import is a file that
would have to be duplicated into the planned React Native app, so if a rule
fires, take the dependency as a port parameter instead of reaching for it.

`store/store.ts` is exempt from the store rule, and only that file: it is a
composition root, the place this platform's persistence is wired into the
store. The slices under `store/slices/` are the part a React Native app
reuses, so they are what the rule enforces. There are no `eslint-disable`
boundary escapes left.

`lib/` is layer-neutral: `types.ts` (view models shared by store +
presentation) and `react-aria-utils.ts` (used only by the unadopted
`components/ui` kit). The base64 helpers that used to live here are now
`@pinai/domain/lib/bytes`, because three packages need them.

Node globals (`process`, `Buffer`, `__dirname`, …) are blocked under `src/` by
`no-restricted-globals`. `@types/node` is in the project because the
wasm-loading specs need it, so the type checker can no longer tell you that
nothing here runs on Node — the linter does instead.

### Documentation maintenance

When creating or modifying code in the "domain" and "adapters" folders, ensure a CLAUDE.md exists in that directory explaining:
- The purpose and responsibility of that module
- Key files and their roles
- Business logic and domain concepts
- Important patterns or conventions specific to this area

Update the relevant CLAUDE.md whenever you make structural changes.
If possible, keep them concise, bullet points, not essays. Aim for under ~50 lines per file.

---

## Dependency Injection (IoC)

There is no container. `ioc/index.ts` constructs the adapters as module-scope
singletons and exposes one accessor per port — fifteen of them, all shaped
`getXxxPort()`. Presentation calls those; it never constructs an adapter.

```typescript
// ioc/index.ts
const dmPort: IDmPort = new DmApiAdapter()

export function getDmPort(): IDmPort {
    return dmPort
}
```

```typescript
// in a viewmodel
import { getDmPort } from "@/ioc"

const conversations = await getDmConversationsUseCase(idpUrl, token, getDmPort())
```

Use cases take their ports as arguments rather than resolving them, which is
what keeps `@pinai/domain` dependency-free and directly testable — the specs
pass stubs positionally, no container to configure.

### Adding a port

1. Define the interface in `@pinai/domain/ports/`.
2. Implement it — in `@pinai/api` if it is transport, `@pinai/crypto` if it is
   protocol crypto, `adapters/` here if it is platform-specific.
3. Construct it in `ioc/index.ts` and add a `getXxxPort()` accessor.
4. Pass it into the use case from the calling viewmodel.

### The second composition root

`store/store.ts` is the other place implementations are wired: it builds the
key-value store, the device key and `SealedStorage`, and hands the persist
middleware its storage. It is separate because the IoC imports the store, so
the store cannot import the IoC.

A React Native app writes its own version of both files. Nothing else changes.

### Global store (Zustand)

- Do not write any business logic in it, just get and set values from it.
