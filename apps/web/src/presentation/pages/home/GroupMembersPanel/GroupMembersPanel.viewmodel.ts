import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useAppStore } from "@/store/store"
import { getGroupPort } from "@/ioc"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import type { GroupMember, GroupRole } from "@pinai/domain/models/group"
import { isBlocked } from "@pinai/domain/models/block"
import { useBlockUser, useBlocks } from "@/presentation/hooks/useBlocks"

export const groupMembersQueryKey = (conversationId: string) => ["group-members", conversationId] as const

export function useGroupMembersPanelViewModel(conversationId: string) {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const myActorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    // Local instance host, used to flag federated members in the roster.
    const localHost = useAppStore((s) => s.user?.address?.split("@")[1] ?? null)
    const openGroupComposer = useAppStore((s) => s.openGroupComposer)
    const switchToDms = useAppStore((s) => s.switchToDms)
    const queryClient = useQueryClient()
    const navigate = useNavigate()

    const {
        data: members = [],
        isLoading,
        error,
    } = useQuery({
        queryKey: groupMembersQueryKey(conversationId),
        queryFn: () => getGroupPort().listMembers(idpUrl!, accessToken!, conversationId),
        enabled: !!idpUrl && !!accessToken && !!conversationId,
    })

    const admins = useMemo(() => members.filter((m) => m.role === "admin"), [members])
    const regularMembers = useMemo(() => members.filter((m) => m.role !== "admin"), [members])
    const isAdmin = useMemo(
        () => members.some((m) => m.actorUri === myActorUri && m.role === "admin"),
        [members, myActorUri],
    )

    const [pendingActor, setPendingActor] = useState<string | null>(null)
    const { blocked } = useBlocks()
    const { block, unblock, isPending: isBlocking } = useBlockUser()

    function refreshMembers() {
        void queryClient.invalidateQueries({ queryKey: groupMembersQueryKey(conversationId) })
    }

    async function removeMember(actorUri: string) {
        if (!idpUrl || !accessToken) return
        setPendingActor(actorUri)
        try {
            await getGroupPort().removeMember(idpUrl, accessToken, conversationId, actorUri)
            refreshMembers()
            void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
        } finally {
            setPendingActor(null)
        }
    }

    async function setRole(actorUri: string, role: GroupRole) {
        if (!idpUrl || !accessToken) return
        setPendingActor(actorUri)
        try {
            await getGroupPort().setMemberRole(idpUrl, accessToken, conversationId, actorUri, role)
            refreshMembers()
        } finally {
            setPendingActor(null)
        }
    }

    async function leaveGroup() {
        if (!idpUrl || !accessToken || !myActorUri) return
        await getGroupPort().removeMember(idpUrl, accessToken, conversationId, myActorUri)
        void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
        switchToDms()
        void navigate({ to: "/home" })
    }

    function openAddPeople() {
        openGroupComposer({ mode: "add", targetConversationId: conversationId })
    }

    return {
        members,
        admins,
        regularMembers,
        isLoading,
        error: error instanceof Error ? error.message : null,
        myActorUri,
        localHost,
        isAdmin,
        pendingActor,
        removeMember,
        setRole,
        leaveGroup,
        openAddPeople,
        /** Their messages here still show, without drawing the user's attention. */
        isBlocked: (actorUri: string) => isBlocked(blocked, actorUri),
        block,
        unblock,
        isBlocking,
    }
}

export type { GroupMember }
