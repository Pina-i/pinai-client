import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { createAuthSlice, type AuthSlice } from "./slices/auth.slice"
import { createUiSlice, type UiSlice } from "./slices/ui.slice"
import { createDataSlice, type DataSlice } from "./slices/data.slice"

export type AppStore = AuthSlice & UiSlice & DataSlice

export const useAppStore = create<AppStore>()(
    devtools(
        (...a) => ({
            ...createAuthSlice(...a),
            ...createUiSlice(...a),
            ...createDataSlice(...a),
        }),
        { name: "AppStore" }
    )
)
