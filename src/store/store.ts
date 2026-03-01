import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { createAuthSlice, type AuthSlice } from "./auth.slice"
import { createAppSlice, type AppSlice } from "./app.slice"

export type AppStore = AuthSlice & AppSlice

export const useAppStore = create<AppStore>()(
    devtools(
        (...a) => ({
            ...createAuthSlice(...a),
            ...createAppSlice(...a),
        }),
        { name: "AppStore" },
    ),
)
