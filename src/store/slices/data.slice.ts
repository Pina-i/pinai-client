import type { StateCreator } from "zustand"
import type { Server, Channel, DmConversation, Member } from "@/lib/types"
import type { AppStore } from "../store"

export interface DataSlice {
    servers: Server[]
    channelsByServer: Record<string, Channel[]>
    localDmConvos: DmConversation[]
    members: Member[]
}

export const createDataSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], DataSlice> = () => ({
    servers: [],
    channelsByServer: {},
    localDmConvos: [],
    members: [],
})
