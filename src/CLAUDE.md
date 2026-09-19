# Development Rules

## General Architecture

This project follows a **hexagonal architecture** (Clean Architecture) with strict separation between layers:

```
locales/              # Translation files
src/ <- this folder
├── domain/           # Business core (use cases, ports, models)
│   ├── models/       # Business entities
│   ├── ports/        # Interfaces for adapters
│   └── usecases/     # Business logic
├── adapters/         # Technical implementations (InMemory, API, etc.)
├── presentation/     # UI layer (Atomic Design)
│   ├── atoms/        # Basic building blocks (Button, Input, Label, etc.)
│   ├── molecules/    # Combinations of atoms (FormField, SearchBar, etc.)
│   ├── organisms/    # Complex UI sections (Header, Form, DataTable, etc.)
│   ├── templates/    # Page layouts and structural components
│   └── pages/        # Application pages (rendered by Tanstack router routes)
├── ioc/              # Dependency injection configuration
└── config/           # Global configurations
└── routes/           # Tanstack Router routes
```

### Dependency principle

- The **domain** depends on nothing (pure TypeScript)
- The **adapters** depend on the domain (implement ports)
- The **presentation** (pages) uses the domain via IoC

These are **enforced by ESLint** (`no-restricted-imports` blocks in
`eslint.config.js`), not merely documented. A crossing import is a file that
would have to be duplicated into the planned React Native app, so if a rule
fires, take the dependency as a port parameter instead of reaching for it.

Two exceptions are marked in `store/` with `eslint-disable` and a TODO: the
store still constructs the IndexedDB storage adapter directly. Removing them
needs the device key behind an encrypt/decrypt port and IndexedDB behind a
key-value port.

`lib/` is layer-neutral: `utils-bytes.ts` (base64 helpers, used by adapters)
and `types.ts` (view models shared by store + presentation).

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

### Structure

The `src/ioc/` folder contains the IoC container configuration based on **tsyringe**:

- `index.ts` - Entry point that initializes all IoC
- `init-helpers.ts` - Registration of utility services (logger, http client, date helper, etc.)
- `init-adapters.ts` - Registration of adapters (port implementations)
- `init-usecases.ts` - Registration of business use cases

### Usage

**1. Define a port in `domain/ports/`**

```typescript
export const VEHICLE_PORT = "VEHICLE_PORT";

export interface IVehiclePort {
  addVehicle(vehicle: Omit<Vehicle, "id">): Promise<Vehicle>;
  getVehicles(): Promise<Vehicle[]>;
}
```

**2. Implement an adapter in `adapters/`**

```typescript
export class VehicleInMemoryAdapter implements IVehiclePort {
  async addVehicle(vehicle: Omit<Vehicle, "id">): Promise<Vehicle> {
    // Implementation...
  }
}
```

**3. Register in `ioc/init-adapters.ts`**

```typescript
import { container } from "tsyringe";

container.register<IVehiclePort>(VEHICLE_PORT, {
  useValue: new VehicleInMemoryAdapter(),
});
```

**4. Use in components with the `useService` hook**

```typescript
import { useService } from "@/components/_hooks/useService";

const vehiclePort = useService<IVehiclePort>(VEHICLE_PORT);
```

### Custom hook

The `useService` hook is a wrapper around the tsyringe container:

```typescript
export const useService = <T>(service: string): T => {
  return container.resolve<T>(service);
};
```

### Global store (Zustand)

- Do not write any business logic in it, just get and set values from it.
