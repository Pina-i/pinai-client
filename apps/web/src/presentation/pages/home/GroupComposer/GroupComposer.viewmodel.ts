import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { toast } from "sonner"
import { getE2eePort, getGroupPort } from "@/ioc"
import { distributeGroupKeysUseCase } from "@pinai/domain/usecases/e2ee/distribute-group-keys.usecase"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import { groupMembersQueryKey } from "@/presentation/pages/home/GroupMembersPanel/GroupMembersPanel.viewmodel"
import { useFriendsPanelViewModel, type Friend } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import type { GroupComposerState } from "@/store/slices/ui.slice"
import { droppedNotice, inviteRefusal } from "./_helpers/invite-refusal.helper"

export function useGroupComposerViewModel(composer: GroupComposerState, onClose: () => void) {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const queryClient = useQueryClient()
    const { friends, isLoading } = useFriendsPanelViewModel()

    const isAddMode = composer.mode === "add"

    // In "add" mode, exclude members already in the target group.
    const { data: existingMembers } = useQuery({
        queryKey: groupMembersQueryKey(composer.targetConversationId ?? ""),
        queryFn: () => getGroupPort().listMembers(idpUrl!, accessToken!, composer.targetConversationId!),
        enabled: isAddMode && !!composer.targetConversationId && !!idpUrl && !!accessToken,
    })
    const excludedIds = useMemo(
        () => new Set((existingMembers ?? []).map((m) => m.actorUri)),
        [existingMembers],
    )

    const [query, setQuery] = useState("")
    const [name, setName] = useState("")
    const [explicitSelection, setExplicitSelection] = useState<Set<string> | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Prefill (e.g. the peer when forking a 1:1) until the user picks explicitly.
    const prefillSelection = useMemo(() => {
        const wanted = new Set(composer.prefillAddresses)
        return new Set(friends.filter((f) => wanted.has(f.address)).map((f) => f.id))
    }, [friends, composer.prefillAddresses])
    const selectedIds = explicitSelection ?? prefillSelection

    const visibleFriends = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return friends
        return friends.filter(
            (f) => f.name.toLowerCase().includes(q) || f.address.toLowerCase().includes(q),
        )
    }, [friends, query])

    const selectedFriends = useMemo(
        () => friends.filter((f) => selectedIds.has(f.id)),
        [friends, selectedIds],
    )

    /** True when any selected member lives on a different instance. */
    const hasFederatedSelection = useMemo(
        () => selectedFriends.some((f) => f.address.split("@")[1] !== idpUrl?.replace(/^https?:\/\//, "")),
        [selectedFriends, idpUrl],
    )

    function toggle(friend: Friend) {
        if (excludedIds.has(friend.id)) return
        setExplicitSelection((prev) => {
            const next = new Set(prev ?? prefillSelection)
            if (next.has(friend.id)) next.delete(friend.id)
            else next.add(friend.id)
            return next
        })
    }

    const nameOf = (actorUri: string) => friends.find((f) => f.id === actorUri)?.name ?? null

    async function distributeKeys(conversationId: string, actorUris: string[]) {
        const { dropped, failed } = await distributeGroupKeysUseCase(
            idpUrl!,
            accessToken!,
            conversationId,
            actorUris,
            getE2eePort(),
            getGroupPort(),
        )
        const notice = droppedNotice(dropped, nameOf)
        if (notice) toast.warning(notice)
        for (const uri of failed) {
            // eslint-disable-next-line no-console
            console.warn(`MLS key delivery failed for ${uri}`)
        }
    }

    async function submit() {
        if (!idpUrl || !accessToken || selectedIds.size === 0 || isSubmitting) return
        const actorUris = selectedFriends.map((f) => f.id)
        setIsSubmitting(true)
        setError(null)
        try {
            if (isAddMode && composer.targetConversationId) {
                const convId = composer.targetConversationId
                // Whoever was added before a refusal still gets their keys.
                const added: string[] = []
                let refused: unknown = null
                for (const uri of actorUris) {
                    try {
                        await getGroupPort().addMember(idpUrl, accessToken, convId, uri)
                        added.push(uri)
                    } catch (e) {
                        refused = e
                        break
                    }
                }
                await distributeKeys(convId, added)
                await queryClient.invalidateQueries({ queryKey: groupMembersQueryKey(convId) })
                if (refused) throw refused
            } else {
                const group = await getGroupPort().createGroup(
                    idpUrl,
                    accessToken,
                    name.trim() || null,
                    actorUris,
                )
                await distributeKeys(group.conversationId, actorUris)
            }
            await queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
            onClose()
        } catch (e) {
            setError(inviteRefusal(e, nameOf))
        } finally {
            setIsSubmitting(false)
        }
    }

    return {
        isAddMode,
        isFork: composer.fromDmId !== null,
        friends: visibleFriends,
        isLoading,
        query,
        setQuery,
        name,
        setName,
        selectedFriends,
        selectedIds,
        excludedIds,
        hasFederatedSelection,
        toggle,
        submit,
        isSubmitting,
        error,
        canSubmit: selectedIds.size > 0 && !isSubmitting,
    }
}
