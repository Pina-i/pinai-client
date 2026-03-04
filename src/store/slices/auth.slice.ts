import type { StateCreator } from "zustand"
import type { UserProfile } from "@/domain/models/auth"
import type { AppStore } from "../store"

export interface AuthSlice {
    /** Access token kept in memory only — never persisted to localStorage. */
    accessToken: string | null
    user: UserProfile | null
    /** The IdP base URL persisted to localStorage so logout redirect survives page reload. */
    idpUrl: string | null

    setSession: (accessToken: string, user: UserProfile, idpUrl: string) => void
    clearSession: () => void
}

export const createAuthSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], AuthSlice> = (set) => ({
    accessToken: null,
    user: null,
    idpUrl: localStorage.getItem("idp_url"),

    setSession: (accessToken, user, idpUrl) => {
        localStorage.setItem("idp_url", idpUrl)
        set({ accessToken, user, idpUrl }, false, "auth/setSession")
    },

    clearSession: () => set({ accessToken: null, user: null }, false, "auth/clearSession"),
})
