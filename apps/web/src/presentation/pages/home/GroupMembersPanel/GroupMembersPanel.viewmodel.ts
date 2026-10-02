import { useEffect, useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useAppStore } from "@/store/store"
import { getE2eePort, getGroupPort } from "@/ioc"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import type { GroupMember, GroupRole } from "@pinai/domain/models/group"
import { isBlocked } from "@pinai/domain/models/block"
import { reconcileGroupKeysUseCase } from "@pinai/domain/usecases/e2ee/reconcile-group-keys.usecase"
import { removeGroupMemberUseCase } from "@pinai/domain/usecases/e2ee/remove-group-member.usecase"
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

    // Opening the group catches up on what a departure left: devices still in its MLS state.
    useEffect(() => {
        if (!idpUrl || !accessToken || !myActorUri) return
        reconcileGroupKeysUseCase(idpUrl, accessToken, conversationId, myActorUri, getGroupPort(), getE2eePort()).catch(
            (e) => {
                // eslint-disable-next-line no-console
                console.warn("Committing departed members' devices out failed:", e)
            },
        )
    }, [idpUrl, accessToken, conversationId, myActorUri])

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
            const { cutOff } = await removeGroupMemberUseCase(
                idpUrl,
                accessToken,
                conversationId,
                actorUri,
                getGroupPort(),
                getE2eePort(),
            )
            if (!cutOff) {
                // eslint-disable-next-line no-console
                console.warn("The member is out; their devices are committed out on the group's next look")
            }
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
