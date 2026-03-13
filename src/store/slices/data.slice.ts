import type { StateCreator } from "zustand"
import type { Server, Channel, DmConversation, Member } from "@/lib/types"
import type { AppStore } from "../store"

export interface DataSlice {
    servers: Server[]
    channelsByServer: Record<string, Channel[]>
    localDmConvos: DmConversation[]
    members: Member[]

    setDmConversations: (convos: DmConversation[]) => void
}

export const createDataSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], DataSlice> = (set) => ({
    servers: [],
    channelsByServer: {},
    localDmConvos: [],
    members: [],

    setDmConversations: (convos) => set({ localDmConvos: convos }, false, "data/setDmConversations"),
})
