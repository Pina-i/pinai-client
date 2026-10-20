import { useEffect } from "react"
import { getPendingFriendRequestsUseCase } from "@pinai/domain/usecases/social/get-pending-friend-requests.usecase"
import { getSocialPort } from "@/ioc"
import { useAppStore } from "@/store/store"

/**
 * On mount, fetches pending incoming friend requests from the API and seeds
 * the notifications store so users see them immediately after a page refresh.
 * Deduplication in addNotification prevents double-entries with live WS events.
 */
export function useLoadPendingNotifications(): void {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const addNotification = useAppStore((s) => s.addNotification)

    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!accessToken || !idpUrl) return

        getPendingFriendRequestsUseCase(idpUrl, accessToken, getSocialPort())
            .then((requests) => {
                for (const req of requests) {
                    addNotification({
                        id: `friend_request:${req.friendship_id}`,
                        eventType: "friend_request",
                        actorUri: req.actor_uri,
                        displayName: req.display_name ?? req.username,
                        receivedAt: new Date().toISOString(),
                        friendshipId: req.friendship_id,
                    })
                }
            })
            .catch(() => {
                // Non-fatal: live WS events will still arrive
            })
    }, [signedIn, idpUrl, addNotification])
}
