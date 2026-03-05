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
    servers: [
        { id: "s1", name: "Pīna'i Dev", initials: "PD" },
        { id: "s2", name: "Gaming Hub", initials: "GH" },
    ],
    channelsByServer: {
        s1: [
            { id: "c1", name: "general", type: "text", category: "Text Channels", unread: 0 },
            { id: "c2", name: "dev-talk", type: "text", category: "Text Channels", unread: 3 },
            { id: "c3", name: "voice-chat", type: "voice", category: "Voice Channels", unread: 0 },
        ],
        s2: [
            { id: "c4", name: "lobby", type: "text", category: "General", unread: 0 },
            { id: "c5", name: "game-night", type: "voice", category: "Voice", unread: 0 },
        ],
    },
    localDmConvos: [
        { id: "dm1", name: "Alice", avatar: "AL", color: "#e879f9", status: "online", lastMessage: "Hey there!", unread: 2 },
        { id: "dm2", name: "Bob", avatar: "BO", color: "#60a5fa", status: "idle", lastMessage: "See you later", unread: 0 },
    ],
    members: [
        { id: "m1", name: "Alice", color: "#e879f9", status: "online", role: "Admin", about: "Lead developer" },
        { id: "m2", name: "Bob", color: "#60a5fa", status: "idle", role: "Mod", about: "Community moderator" },
        { id: "m3", name: "Charlie", color: "#34d399", status: "online", role: "Member", about: "New member" },
        { id: "m4", name: "Diana", color: "#f97316", status: "offline", role: "Member", about: "Designer" },
    ],
})
