import type { StateCreator } from "zustand"
import type { Server, Channel, DmConversation, Member } from "@/lib/types"
import type { AppStore } from "../store"

export interface DataSlice {
    servers: Server[]
    channelsByServer: Record<string, Channel[]>
    localDmConvos: DmConversation[]
    members: Member[]
    dmConversationsVersion: number
    dmUnread: Record<string, number>

    setDmConversations: (convos: DmConversation[]) => void
    bumpDmConversationsVersion: () => void
    incrementDmUnread: (address: string) => void
    clearDmUnread: (address: string) => void
    seedDmUnread: (counts: Record<string, number>) => void
}

export const createDataSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], DataSlice> = (set) => ({
    servers: [],
    channelsByServer: {},
    localDmConvos: [],
    members: [],
    dmConversationsVersion: 0,
    dmUnread: {},

    setDmConversations: (convos) => set({ localDmConvos: convos }, false, "data/setDmConversations"),
    bumpDmConversationsVersion: () =>
        set((s) => ({ dmConversationsVersion: s.dmConversationsVersion + 1 }), false, "data/bumpDmConversationsVersion"),
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
