import { useEffect } from "react"
import { useAppStore } from "@/store/store"
import { getDmConversationsUseCase } from "@/domain/usecases/dm/get-dm-conversations.usecase"
import { getDmPort } from "@/ioc"
import { actorUriToAddress } from "@/domain/models/dm"
import type { DmConversation } from "@/lib/types"

function colorFromString(s: string): string {
    let hash = 0
    for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0
    return `hsl(${Math.abs(hash) % 360}, 65%, 60%)`
}

/**
 * On mount, fetches the DM conversation list and seeds localDmConvos in the store.
 * Called once from the authenticated layout so the sidebar populates after login.
 */
export function useLoadDmConversations(): void {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const setDmConversations = useAppStore((s) => s.setDmConversations)

    useEffect(() => {
        if (!accessToken || !idpUrl) return

        getDmConversationsUseCase(idpUrl, accessToken, getDmPort())
            .then((summaries) => {
                const convos: DmConversation[] = summaries.map((summary) => {
                    const address = actorUriToAddress(summary.other_actor_uri)
                    const display = address.split("@")[0] ?? address
                    return {
                        id: address,
                        name: address,
                        avatar: display.slice(0, 2).toUpperCase(),
                        color: colorFromString(address),
                        status: "offline" as const,
                        lastMessage: "",
                        unread: 0,
                    }
                })
                setDmConversations(convos)
            })
            .catch(() => {
                // Non-fatal: sidebar DM list will just be empty
            })
    }, [accessToken, idpUrl, setDmConversations])
}
