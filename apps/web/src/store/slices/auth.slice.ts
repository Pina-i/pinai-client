import type { UserProfile } from "@pinai/domain/models/auth"
import type { UserStatus } from "@pinai/domain/models/presence"
import type { StateCreator } from "zustand"
import type { AppStore } from "../store"

export interface AuthSlice {
    /** Access token kept in memory only — never persisted to localStorage. */
    accessToken: string | null
    user: UserProfile | null
    /** The IdP base URL persisted to localStorage so logout redirect survives page reload. */
    idpUrl: string | null
    /** Local user-selected presence (no backend setter wired yet — UI-only for now). */
    myStatus: UserStatus

    setSession: (accessToken: string, user: UserProfile, idpUrl: string) => void
    clearSession: () => void
    setMyStatus: (status: UserStatus) => void
    setAvatarUrl: (url: string | null) => void
    /** Replace the user profile (after a successful PATCH /api/profile). */
    setUser: (user: UserProfile) => void
}

export const createAuthSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], AuthSlice> = (set) => ({
    accessToken: null,
    user: null,
    idpUrl: localStorage.getItem("idp_url"),
    myStatus: "online",

    setSession: (accessToken, user, idpUrl) => {
        localStorage.setItem("idp_url", idpUrl)
        set(
            (state) => ({
                accessToken,
                user,
                idpUrl,
                avatarsByAddress: {
                    ...state.avatarsByAddress,
                    [user.address]: user.avatar_url ?? null,
                },
            }),
            false,
            "auth/setSession",
        )
    },

    clearSession: () =>
        set(
            // Clear fingerprints alongside the session — they belong to
            // the user that just logged out and re-fetching them on
            // first interaction post-login is cheap.
            { accessToken: null, user: null, fingerprintsByActorUri: {} },
            false,
            "auth/clearSession",
        ),

    setMyStatus: (status) => set({ myStatus: status }, false, "auth/setMyStatus"),

    setAvatarUrl: (url) =>
        set(
            (state) => {
                const user = state.user ? { ...state.user, avatar_url: url ?? undefined } : state.user
                const avatarsByAddress = state.user
                    ? { ...state.avatarsByAddress, [state.user.address]: url }
                    : state.avatarsByAddress
                return { user, avatarsByAddress }
            },
            false,
            "auth/setAvatarUrl",
        ),

    setUser: (user) =>
        set(
            (state) => ({
                user,
                avatarsByAddress: {
                    ...state.avatarsByAddress,
                    [user.address]: user.avatar_url ?? null,
                },
            }),
            false,
            "auth/setUser",
        ),
})
