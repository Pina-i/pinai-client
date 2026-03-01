import type { StateCreator } from "zustand"

// App-wide state that is not auth-related (UI preferences, navigation state, etc.)
// Add new fields here as the app grows.
export interface AppSlice {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const createAppSlice: StateCreator<
    AppSlice,
    [["zustand/devtools", never]],
    [],
    AppSlice
> = () => ({})
