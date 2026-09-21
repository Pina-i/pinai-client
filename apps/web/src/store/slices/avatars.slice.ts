import type { StateCreator } from "zustand"
import type { AppStore } from "../store"

/**
 * Centralized avatar URL store, keyed by federated address (`username@domain`).
 *
 * Why a map: avatar URLs change over time but messages are immutable historical
 * records. Storing the URL on each message snapshot would mean stale avatars on
 * old messages and noisy "patch every message by author" updates when the user
 * changes their picture. Instead, every Avatar callsite reads the current URL
 * from this map by address — same model as Discord/Slack/Mastodon.
 *
 * Seeded from: friends list, DM conversation list members, the local user.
 * Updated by: the `friend_profile_updated` WebSocket event.
 */
export interface AvatarsSlice {
    avatarsByAddress: Record<string, string | null>

    setAvatarFor: (address: string, url: string | null) => void
    seedAvatars: (entries: Array<{ address: string; url: string | null }>) => void
}

export const createAvatarsSlice: StateCreator<
    AppStore,
    [["zustand/devtools", never]],
    [],
    AvatarsSlice
> = (set) => ({
    avatarsByAddress: {},

    setAvatarFor: (address, url) =>
        set(
            (s) => ({ avatarsByAddress: { ...s.avatarsByAddress, [address]: url } }),
            false,
            "avatars/setAvatarFor",
        ),

    seedAvatars: (entries) =>
        set(
            (s) => {
                if (entries.length === 0) return s
                const next = { ...s.avatarsByAddress }
                for (const { address, url } of entries) {
                    next[address] = url
                }
                return { avatarsByAddress: next }
            },
            false,
            "avatars/seedAvatars",
        ),
})
