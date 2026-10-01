import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { getPrivacyPort } from "@/ioc"
import { useAppStore } from "@/store/store"
import { blockedAddresses, type BlockedActorEntry } from "@pinai/domain/models/block"
import { blockUserUseCase } from "@pinai/domain/usecases/privacy/block-user.usecase"
import { getBlocksUseCase } from "@pinai/domain/usecases/privacy/get-blocks.usecase"
import { unblockUserUseCase } from "@pinai/domain/usecases/privacy/unblock-user.usecase"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"

export const blocksQueryKey = (idpUrl: string) => ["blocks", idpUrl] as const

/** The people the user blocked, refetched on `blocks_updated` from any of their sessions. */
export function useBlocks(): { blocks: BlockedActorEntry[]; blocked: ReadonlySet<string>; isLoading: boolean } {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)

    const { data: blocks = [], isLoading } = useQuery({
        queryKey: blocksQueryKey(idpUrl ?? ""),
        queryFn: () => getBlocksUseCase(idpUrl!, accessToken!, getPrivacyPort()),
        enabled: !!accessToken && !!idpUrl,
    })
    const blocked = useMemo(() => blockedAddresses(blocks), [blocks])

    return { blocks, blocked, isLoading }
}

/**
 * Blocks and unblocks, then refreshes what depends on it. A block ends the friendship, so the
 * friends list is refetched; the DM is kept, so the DM list only refreshes.
 */
export function useBlockUser() {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const queryClient = useQueryClient()
    const [isPending, setIsPending] = useState(false)

    function refresh(url: string) {
        void queryClient.invalidateQueries({ queryKey: blocksQueryKey(url) })
        void queryClient.invalidateQueries({ queryKey: friendsQueryKey(url) })
        void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(url) })
    }

    /** Resolves to whether it worked; failures surface as a toast. */
    async function run(action: () => Promise<void>, done: string): Promise<boolean> {
        if (!accessToken || !idpUrl) return false
        setIsPending(true)
        try {
            await action()
            toast.success(done)
            refresh(idpUrl)
            return true
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong")
            return false
        } finally {
            setIsPending(false)
        }
    }

    const block = (actorUri: string, name: string) =>
        run(() => blockUserUseCase(idpUrl!, accessToken!, actorUri, getPrivacyPort()), `${name} is blocked`)
    const unblock = (actorUri: string, name: string) =>
        run(() => unblockUserUseCase(idpUrl!, accessToken!, actorUri, getPrivacyPort()), `${name} is unblocked`)

    return { block, unblock, isPending }
}
