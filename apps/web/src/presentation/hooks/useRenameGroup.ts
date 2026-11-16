import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getGroupPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { MAX_GROUP_NAME_LENGTH, groupRename } from "@pinai/domain/models/group"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"

/**
 * A rename of the group `conversationId`, named `current` (`null` while unnamed): the draft starts
 * from its name when the editor mounts. `save` resolves to whether the group took the new name;
 * a failure surfaces as a toast.
 */
export function useRenameGroup(conversationId: string, current: string | null) {
    const [draft, setDraft] = useState(current ?? "")
    const [isPending, setIsPending] = useState(false)
    const queryClient = useQueryClient()
    const name = groupRename(draft, current)

    async function save(): Promise<boolean> {
        const { accessToken, idpUrl } = useAppStore.getState()
        if (!name || !accessToken || !idpUrl) return false
        setIsPending(true)
        try {
            await getGroupPort().renameGroup(idpUrl, accessToken, conversationId, name)
            // Waits for the list, so the editor never closes on the old name.
            await queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
            return true
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong")
            return false
        } finally {
            setIsPending(false)
        }
    }

    return {
        draft,
        setDraft: (value: string) => setDraft(value.slice(0, MAX_GROUP_NAME_LENGTH)),
        maxLength: MAX_GROUP_NAME_LENGTH,
        /** Whether there is a new name to send. */
        canSave: name !== null && !isPending,
        isPending,
        save,
    }
}
