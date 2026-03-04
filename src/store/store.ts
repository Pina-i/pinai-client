import { create } from "zustand"
import { devtools } from "zustand/middleware"
import { createAuthSlice, type AuthSlice } from "./slices/auth.slice"
import { createNavigationSlice, type NavigationSlice } from "./slices/navigation.slice"
import { createUiSlice, type UiSlice } from "./slices/ui.slice"
import { createChatSlice, type ChatSlice } from "./slices/chat.slice"
import { createDataSlice, type DataSlice } from "./slices/data.slice"

export type AppStore = AuthSlice & NavigationSlice & UiSlice & ChatSlice & DataSlice

export const useAppStore = create<AppStore>()(
    devtools(
        (...a) => ({
            ...createAuthSlice(...a),
            ...createNavigationSlice(...a),
            ...createUiSlice(...a),
            ...createChatSlice(...a),
            ...createDataSlice(...a),
        }),
        { name: "AppStore" },
    ),
)
