import type { StateCreator } from "zustand"
import type { PresenceState } from "@pinai/domain/models/presence"
import type { AppStore } from "../store"

export interface TypingEntry {
    actorUri: string
    /** Epoch ms when the indicator should be cleared (3s after the last typing event). */
    expiresAt: number
}

export interface PresenceSlice {
    /** Presence keyed by federated address (`username@domain`). */
    presenceByAddress: Record<string, PresenceState>
    /** Active typers keyed by conversation_id (UUID). */
    typingByConversation: Record<string, TypingEntry[]>

    setPresence: (address: string, state: PresenceState) => void
    seedPresence: (entries: Record<string, PresenceState>) => void
    addTyping: (conversationId: string, actorUri: string, expiresAt: number) => void
    pruneExpiredTyping: (now: number) => void
}

const TYPING_TTL_MS = 3000

export const createPresenceSlice: StateCreator<
    AppStore,
    [["zustand/devtools", never]],
    [],
    PresenceSlice
> = (set) => ({
    presenceByAddress: {},
    typingByConversation: {},

    setPresence: (address, state) =>
        set(
            (s) => ({ presenceByAddress: { ...s.presenceByAddress, [address]: state } }),
            false,
            "presence/setPresence",
        ),

    seedPresence: (entries) =>
        set(
            (s) => ({ presenceByAddress: { ...s.presenceByAddress, ...entries } }),
            false,
            "presence/seedPresence",
        ),

    addTyping: (conversationId, actorUri, expiresAt) =>
        set(
            (s) => {
                const existing = s.typingByConversation[conversationId] ?? []
                const filtered = existing.filter((t) => t.actorUri !== actorUri)
                return {
                    typingByConversation: {
                        ...s.typingByConversation,
                        [conversationId]: [...filtered, { actorUri, expiresAt }],
                    },
                }
            },
            false,
            "presence/addTyping",
        ),

    pruneExpiredTyping: (now) =>
        set(
            (s) => {
                let changed = false
                const next: Record<string, TypingEntry[]> = {}
                for (const [convId, entries] of Object.entries(s.typingByConversation)) {
                    const kept = entries.filter((t) => t.expiresAt > now)
                    if (kept.length !== entries.length) changed = true
                    if (kept.length > 0) next[convId] = kept
                }
                return changed ? { typingByConversation: next } : s
            },
            false,
            "presence/pruneExpiredTyping",
        ),
})

export const TYPING_INDICATOR_TTL_MS = TYPING_TTL_MS
