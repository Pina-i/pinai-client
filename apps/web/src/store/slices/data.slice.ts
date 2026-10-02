import type { StateCreator } from "zustand"
import type { Server, Channel, DmConversation, Member } from "@/lib/types"
import type { AppStore } from "../store"

export interface DataSlice {
    servers: Server[]
    channelsByServer: Record<string, Channel[]>
    localDmConvos: DmConversation[]
    members: Member[]
    /** Unread counts keyed by conversation_id (UUID). */
    dmUnread: Record<string, number>

    setDmConversations: (convos: DmConversation[]) => void
    /** Mark a group the user was just removed from, ahead of the list's refetch. */
    markDmRemoved: (conversationId: string, at: string) => void
    /** Increment unread count for a conversation_id. */
    incrementDmUnread: (conversationId: string) => void
    /** Clear unread count for a conversation_id. */
    clearDmUnread: (conversationId: string) => void
    seedDmUnread: (counts: Record<string, number>) => void
}

export const createDataSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], DataSlice> = (set) => ({
    servers: [],
    channelsByServer: {},
    localDmConvos: [],
    members: [],
    dmUnread: {},

    setDmConversations: (convos) => set({ localDmConvos: convos }, false, "data/setDmConversations"),
    markDmRemoved: (conversationId, at) =>
        set(
            (s) => ({
                localDmConvos: s.localDmConvos.map((c) => (c.id === conversationId ? { ...c, removedAt: at } : c)),
            }),
            false,
            "data/markDmRemoved",
        ),
    incrementDmUnread: (address) =>
        set(
            (s) => ({ dmUnread: { ...s.dmUnread, [address]: (s.dmUnread[address] ?? 0) + 1 } }),
            false,
            "data/incrementDmUnread",
        ),
    clearDmUnread: (address) =>
        set(
            (s) => {
                const next = { ...s.dmUnread }
                delete next[address]
                return { dmUnread: next }
            },
            false,
            "data/clearDmUnread",
        ),
    seedDmUnread: (counts) => set({ dmUnread: counts }, false, "data/seedDmUnread"),
})
