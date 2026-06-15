import type { StateCreator } from "zustand"
import type { Member } from "@/lib/types"
import type { AppStore } from "../store"

export interface UiSlice {
    view: "server" | "dms"
    activeServer: string
    activeChannel: string
    activeDm: string | null
    showPinned: boolean
    showMembers: boolean
    searchQuery: string
    showSettings: boolean
    showUserProfile: Member | null
    groupComposer: GroupComposerState | null
    showGroupMembers: boolean

    setShowPinned: (value: boolean | ((prev: boolean) => boolean)) => void
    setShowMembers: (value: boolean | ((prev: boolean) => boolean)) => void
    setSearchQuery: (value: string) => void
    setShowSettings: (value: boolean) => void
    setShowUserProfile: (value: Member | null) => void
    openGroupComposer: (opts?: Partial<GroupComposerState>) => void
    closeGroupComposer: () => void
    setShowGroupMembers: (value: boolean | ((prev: boolean) => boolean)) => void

    switchToServer: (serverId: string) => void
    switchToDms: () => void
    selectChannel: (channelId: string) => void
    setActiveDm: (dmId: string | null) => void
    openDmWith: (name: string) => void
}

export interface GroupComposerState {
    /** "create" → new group; "add" → add members to `targetConversationId`. */
    mode: "create" | "add"
    prefillAddresses: string[]
    fromDmId: string | null
    targetConversationId: string | null
}

export const createUiSlice: StateCreator<AppStore, [["zustand/devtools", never]], [], UiSlice> = (set, get) => ({
    view: "dms",
    activeServer: "",
    activeChannel: "",
    activeDm: null,
    showPinned: false,
    showMembers: true,
    searchQuery: "",
    showSettings: false,
    showUserProfile: null,
    groupComposer: null,
    showGroupMembers: false,

    setShowPinned: (value) =>
        set(
            (s) => ({ showPinned: typeof value === "function" ? value(s.showPinned) : value }),
            false,
            "ui/setShowPinned",
        ),
    setShowMembers: (value) =>
        set(
            (s) => ({ showMembers: typeof value === "function" ? value(s.showMembers) : value }),
            false,
            "ui/setShowMembers",
        ),
    setSearchQuery: (value) => set({ searchQuery: value }, false, "ui/setSearchQuery"),
    setShowSettings: (value) => set({ showSettings: value }, false, "ui/setShowSettings"),
    setShowUserProfile: (value) => set({ showUserProfile: value }, false, "ui/setShowUserProfile"),
    openGroupComposer: (opts) =>
        set(
            {
                groupComposer: {
                    mode: opts?.mode ?? "create",
                    prefillAddresses: opts?.prefillAddresses ?? [],
                    fromDmId: opts?.fromDmId ?? null,
                    targetConversationId: opts?.targetConversationId ?? null,
                },
            },
            false,
            "ui/openGroupComposer",
        ),
    closeGroupComposer: () => set({ groupComposer: null }, false, "ui/closeGroupComposer"),
    setShowGroupMembers: (value) =>
        set(
            (s) => ({ showGroupMembers: typeof value === "function" ? value(s.showGroupMembers) : value }),
            false,
            "ui/setShowGroupMembers",
        ),

    switchToServer: (serverId) => {
        const { channelsByServer } = get()
        const channels = channelsByServer[serverId] ?? []
        const firstTextChannel = channels.find((c) => c.type === "text")
        set(
            { view: "server", activeServer: serverId, activeChannel: firstTextChannel?.id ?? "", activeDm: null },
            false,
            "ui/switchToServer",
        )
    },
    switchToDms: () => set({ view: "dms", activeDm: null }, false, "ui/switchToDms"),
    selectChannel: (channelId) => set({ activeChannel: channelId }, false, "ui/selectChannel"),
    setActiveDm: (dmId) => set({ activeDm: dmId, showGroupMembers: false }, false, "ui/setActiveDm"),
    openDmWith: (name) => {
        const { localDmConvos } = get()
        const existing = localDmConvos.find((d) => d.address === name)
        set({ view: "dms", activeDm: existing?.id ?? null }, false, "ui/openDmWith")
    },
})
