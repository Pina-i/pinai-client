import type { UserProfile } from "@pinai/domain/models/auth"
import Storage from "expo-sqlite/kv-store"
import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

interface AuthSlice {
    /** In memory only: a restart renews it from the keychain's refresh token. */
    accessToken: string | null
    user: UserProfile | null
    /** The instance signed in to, kept so a restart knows where to resume. */
    idpUrl: string | null
    setSession: (accessToken: string, user: UserProfile, idpUrl: string) => void
    clearSession: () => void
}

// The kv-store's synchronous half: the instance is known before the first render.
const storage = createJSONStorage(() => ({
    getItem: (name: string) => Storage.getItemSync(name),
    setItem: (name: string, value: string) => Storage.setItemSync(name, value),
    removeItem: (name: string) => void Storage.removeItemSync(name),
}))

export const useAppStore = create<AuthSlice>()(
    persist(
        (set) => ({
            accessToken: null,
            user: null,
            idpUrl: null,
            setSession: (accessToken, user, idpUrl) => set({ accessToken, user, idpUrl }),
            clearSession: () => set({ accessToken: null, user: null, idpUrl: null }),
        }),
        { name: "pinai.session", storage, partialize: (state) => ({ idpUrl: state.idpUrl }) },
    ),
)
