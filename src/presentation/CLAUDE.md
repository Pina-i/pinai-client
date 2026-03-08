# Presentation Layer

This directory contains all UI pages and their associated components.

## Component Organization

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

### Reusable components

If a component is not specific to its page and could be reused elsewhere, do not keep it in the page's subfolder. Instead, move it to the appropriate level of the Atomic Design hierarchy as defined in the project root CLAUDE.md.

Before creating a new reusable component, check if a similar one already exists in the Atomic Design folders.

## ViewModel pattern

When a component has non-trivial logic (state management, data transformation, side effects, computed values), extract it into a dedicated `ComponentName.viewmodel.ts` file alongside the component.

The viewmodel exports a custom hook (e.g. `useDashboardHeaderViewModel`) that encapsulates all logic and returns the data/handlers the component needs. The component itself should remain purely presentational, only consuming what the viewmodel provides.

Do not create a viewmodel for simple components that only receive and display props.

## Guidelines

- Prefer small, single-responsibility components over large monolithic page components
- A page component should mainly compose its sub-components and handle page-level state/data fetching
- Keep presentational logic separated from business logic
- Do not use directly React Aria components in the pages folder, instead create React-Aria based reusable components with native declarative props format, and using Tailwind CSS, tailwind variant, and the Shadcn-style token system.
- Use Tailwind CSS with Shadcn-style token system for styling when you design new pages
- Use Tanstack query for data fetching and caching
