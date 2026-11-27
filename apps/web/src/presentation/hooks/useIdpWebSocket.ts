import { useEffect, useLayoutEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { getDmPort, getE2eePort, getGroupPort, getNotificationSoundPort, getWsPort } from "@/ioc"
import type { WsConnectionStatus, WsServerEvent } from "@pinai/domain/models/ws"
import { actorUriToAddress } from "@pinai/domain/models/identity"
import {
    type ReceiveContext,
    receiveDeliveryFailureUseCase,
    receiveEditUseCase,
    receiveMessageUseCase,
} from "@pinai/domain/usecases/dm/receive-message.usecase"
import { reconcileGroupKeysUseCase } from "@pinai/domain/usecases/e2ee/reconcile-group-keys.usecase"
import { shouldPingForMessage } from "@pinai/domain/models/mute"
import { isBlocked } from "@pinai/domain/models/block"
import { settleIncomingReadUseCase } from "@pinai/domain/usecases/dm/settle-incoming-read.usecase"
import { blocksQueryKey, useBlocks } from "@/presentation/hooks/useBlocks"
import { TYPING_INDICATOR_TTL_MS } from "@/store/slices/presence.slice"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import { peopleQueryKey } from "@/presentation/pages/home/FriendsPanel/AddFriendPopover/people-query-keys"
import { changesRelation } from "@pinai/domain/models/people-search"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import { profileCardQueryKey, profileCardsQueryKey } from "@/presentation/hooks/useProfileCard"
import { groupMembersQueryKey } from "@/presentation/hooks/useGroupMembers"
import { useAppearance } from "@/presentation/providers/AppearanceProvider/AppearanceProvider.context"
import { useNotificationSettings } from "@/presentation/providers/AppearanceProvider/NotificationSettings.context"
import { renewAccessToken } from "@/presentation/_libs/session-renewal"
import { startOverQueryKey } from "@/presentation/hooks/use-own-start-over"
import { isWindowAttended } from "@/presentation/_libs/window-attention"
import { conversationCache } from "@/presentation/_libs/conversation-cache"

/** Module-level slot — `useDeviceFanout` registers its callback here. */
const deviceFanoutHandlerRef: { current: (() => void) | null } = {
    current: null,
}

export function registerDeviceFanoutHandler(handler: () => void): () => void {
    deviceFanoutHandlerRef.current = handler
    return () => {
        if (deviceFanoutHandlerRef.current === handler) {
            deviceFanoutHandlerRef.current = null
        }
    }
}

export type ApprovalEvent = Extract<WsServerEvent, { type: "approval_requested" | "approval_message" | "approval_closed" }>

/** Module-level slot — the approval prompt (`ApprovalDoor`) registers here. */
const approvalHandlerRef: { current: ((event: ApprovalEvent) => void) | null } = { current: null }

export function registerApprovalHandler(handler: (event: ApprovalEvent) => void): () => void {
    approvalHandlerRef.current = handler
    return () => {
        if (approvalHandlerRef.current === handler) {
            approvalHandlerRef.current = null
        }
    }
}

/** Module-level slot — `useHistoryShare` registers here: a key share waits for this device. */
const historyKeyReadyHandlerRef: { current: (() => void) | null } = { current: null }

export function registerHistoryKeyReadyHandler(handler: () => void): () => void {
    historyKeyReadyHandlerRef.current = handler
    return () => {
        if (historyKeyReadyHandlerRef.current === handler) {
            historyKeyReadyHandlerRef.current = null
        }
    }
}

export type StartOverEvent = Extract<WsServerEvent, { type: "start_over_requested" | "start_over_cancelled" }>

/** Module-level slot — the start over prompt (`StartOverDoor`) registers here. */
const startOverHandlerRef: { current: ((event: StartOverEvent) => void) | null } = { current: null }

export function registerStartOverHandler(handler: (event: StartOverEvent) => void): () => void {
    startOverHandlerRef.current = handler
    return () => {
        if (startOverHandlerRef.current === handler) {
            startOverHandlerRef.current = null
        }
    }
}

/** Module-level slot — `useMessagingRuntime` registers the domain's runtime here: the pushes it schedules from. */
const messagingRuntimeHandlerRef: { current: ((event: WsServerEvent) => void) | null } = { current: null }

export function registerMessagingRuntimeHandler(handler: (event: WsServerEvent) => void): () => void {
    messagingRuntimeHandlerRef.current = handler
    return () => {
        if (messagingRuntimeHandlerRef.current === handler) {
            messagingRuntimeHandlerRef.current = null
        }
    }
}

/** Module-level slot — `useReplenishKeyPackages` registers its refill here once the device is onboarded. */
const keyPackagesLowHandlerRef: { current: (() => void) | null } = { current: null }

export function registerKeyPackagesLowHandler(handler: () => void): () => void {
    keyPackagesLowHandlerRef.current = handler
    return () => {
        if (keyPackagesLowHandlerRef.current === handler) {
            keyPackagesLowHandlerRef.current = null
        }
    }
}

/**
 * Manages the IdP WebSocket lifecycle.
 * Connects when authenticated, disconnects on logout or unmount.
 * Dispatches incoming events to the Zustand store.
 */
export function useIdpWebSocket(): void {
    // Signed in or not: a renewed token keeps the socket, and each reconnect reads the token anew.
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const user = useAppStore((s) => s.user)
    const setWsStatus = useAppStore((s) => s.setWsStatus)
    const addNotification = useAppStore((s) => s.addNotification)
    const incrementDmUnread = useAppStore((s) => s.incrementDmUnread)
    const activeDm = useAppStore((s) => s.activeDm)
    const setPresence = useAppStore((s) => s.setPresence)
    const addTyping = useAppStore((s) => s.addTyping)
    const setAvatarFor = useAppStore((s) => s.setAvatarFor)
    const addGroupEvents = useAppStore((s) => s.addGroupEvents)
    const markDmRemoved = useAppStore((s) => s.markDmRemoved)
    const queryClient = useQueryClient()
    const { receiveAccountSettings } = useAppearance()
    const { notifications } = useNotificationSettings()
    const { blocked } = useBlocks()

    // Use refs for store actions to avoid stale closures in adapter callbacks.
    // The ref is seeded at mount and refreshed in a layout effect rather than
    // during render: writing `.current` while rendering is impure, and a render
    // React discards would leave the ref holding values that were never
    // committed. `useLayoutEffect` runs before paint, so the WS callbacks —
    // which only ever fire from async network events — never observe a stale
    // snapshot.
    const actions = {
        setWsStatus,
        addNotification,
        incrementDmUnread,
        activeDm,
        user,
        setPresence,
        addTyping,
        setAvatarFor,
        addGroupEvents,
        markDmRemoved,
        receiveAccountSettings,
        notifications,
        blocked,
    }
    const actionsRef = useRef(actions)
    useLayoutEffect(() => {
        actionsRef.current = actions
    })

    useEffect(() => {
        if (!signedIn || !idpUrl) return

        const wsPort = getWsPort()
        const currentToken = () => useAppStore.getState().accessToken
        // Read at each push: the user and the token change under the socket.
        const receiving = (accessToken: string | null): ReceiveContext => ({
            myAddress: actionsRef.current.user?.address,
            catchUp: accessToken ? { idpUrl, accessToken } : undefined,
        })

        wsPort.onStatusChange((status: WsConnectionStatus) => {
            actionsRef.current.setWsStatus(status)
        })

        wsPort.onEvent(async (event: WsServerEvent) => {
            const accessToken = currentToken()
            // heartbeat_ack is purely a keep-alive — no UI side effect.
            if (event.type === "heartbeat_ack") return
            // An open "Add a friend" must turn Add into Accept when that person's request arrives.
            if (idpUrl && changesRelation(event.type)) queryClient.invalidateQueries({ queryKey: peopleQueryKey(idpUrl) })

            switch (event.type) {
                case "presence_update": {
                    const address = actorUriToAddress(event.data.actorUri)
                    actionsRef.current.setPresence(address, event.data.state)
                    break
                }
                case "typing": {
                    // Server already excludes the sender, but guard anyway in case
                    // the user has another tab open with the same identity.
                    const senderAddress = actorUriToAddress(event.data.actorUri)
                    if (senderAddress === actionsRef.current.user?.address) break
                    if (isBlocked(actionsRef.current.blocked, senderAddress)) break
                    actionsRef.current.addTyping(
                        event.data.conversationId,
                        event.data.actorUri,
                        Date.now() + TYPING_INDICATOR_TTL_MS,
                    )
                    break
                }
                case "new_dm": {
                    const conversationId = event.data.conversation_id
                    const arrival = await receiveMessageUseCase(event.data, receiving(accessToken), {
                        e2ee: getE2eePort(),
                        cache: conversationCache,
                    })
                    if (arrival.kind !== "message") break

                    if (arrival.mine) {
                        // Sent from one of the user's other devices: nothing to ring or count.
                        if (idpUrl) {
                            queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
                        }
                        break
                    }

                    const senderBlocked = isBlocked(actionsRef.current.blocked, arrival.senderAddress)

                    // Sound plays whether or not the user is in this
                    // conversation — confirms the message arrived even
                    // when they're looking elsewhere on screen.
                    if (
                        shouldPingForMessage(
                            actionsRef.current.notifications,
                            conversationId,
                            useAppStore.getState().myStatus,
                            senderBlocked,
                        )
                    ) {
                        getNotificationSoundPort().playDmReceived()
                    }

                    // Read only while open on a window the user is in: otherwise it waits, counted, until they come back.
                    void settleIncomingReadUseCase(
                        {
                            conversationId,
                            openId: actionsRef.current.activeDm,
                            windowAttended: isWindowAttended(),
                            senderBlocked,
                        },
                        accessToken ? { idpUrl, accessToken } : null,
                        {
                            port: getDmPort(),
                            countUnread: actionsRef.current.incrementDmUnread,
                            refreshList: () => void queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) }),
                        },
                    ).catch((e) => {
                        // eslint-disable-next-line no-console
                        console.warn("markConversationRead failed:", e)
                    })
                    break
                }
                case "message_edited": {
                    await receiveEditUseCase(event.data, receiving(accessToken), { e2ee: getE2eePort(), cache: conversationCache })
                    break
                }
                case "dm_delivery_failed": {
                    await receiveDeliveryFailureUseCase(event.data, conversationCache)
                    break
                }
                case "mls_commit":
                case "mls_welcome_ready": {
                    messagingRuntimeHandlerRef.current?.(event)
                    break
                }
                case "group_created": {
                    if (idpUrl) {
                        queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
                    }
                    break
                }
                case "member_added":
                case "member_removed":
                case "member_role_changed":
                case "group_renamed": {
                    queryClient.invalidateQueries({
                        queryKey: groupMembersQueryKey(event.data.conversationId),
                    })
                    if (idpUrl) {
                        queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
                    }
                    const me = actionsRef.current.user?.actor_uri
                    if (event.type === "member_removed" && event.data.actorUri === me) {
                        if (event.data.removedByActorUri) {
                            actionsRef.current.markDmRemoved(event.data.conversationId, new Date().toISOString())
                        }
                        break
                    }
                    // Whoever left can't commit their own devices out: an admin here does.
                    if (event.type === "member_removed" && me && idpUrl && accessToken) {
                        reconcileGroupKeysUseCase(
                            idpUrl,
                            accessToken,
                            event.data.conversationId,
                            me,
                            getGroupPort(),
                            getE2eePort(),
                        ).catch((e) => {
                            // eslint-disable-next-line no-console
                            console.warn("Committing a departed member's devices out failed:", e)
                        })
                    }
                    break
                }
                case "group_event": {
                    actionsRef.current.addGroupEvents(event.data.conversationId, [event.data])
                    break
                }
                case "settings_updated": {
                    actionsRef.current.receiveAccountSettings(event.data.settings)
                    break
                }
                case "blocks_updated": {
                    // Another session blocked or unblocked someone: a block also ended a friendship.
                    if (idpUrl) {
                        queryClient.invalidateQueries({ queryKey: blocksQueryKey(idpUrl) })
                        queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
                        queryClient.invalidateQueries({ queryKey: profileCardsQueryKey(idpUrl) })
                    }
                    break
                }
                case "device_approved": {
                    getE2eePort().approvalLanded()
                    deviceFanoutHandlerRef.current?.()
                    break
                }
                case "device_joined": {
                    // useDeviceFanout owns the actual fanout via its registered ref.
                    deviceFanoutHandlerRef.current?.()
                    break
                }
                case "history_key_ready": {
                    historyKeyReadyHandlerRef.current?.()
                    break
                }
                case "key_packages_low": {
                    keyPackagesLowHandlerRef.current?.()
                    break
                }
                case "approval_requested":
                case "approval_message":
                case "approval_closed": {
                    approvalHandlerRef.current?.(event)
                    break
                }
                case "start_over_requested":
                case "start_over_cancelled": {
                    startOverHandlerRef.current?.(event)
                    if (idpUrl) queryClient.invalidateQueries({ queryKey: startOverQueryKey(idpUrl) })
                    break
                }
                case "friend_request":
                case "friend_accepted": {
                    actionsRef.current.addNotification({
                        // Stable composite id prevents duplicates with API-seeded notifications.
                        id: `${event.type}:${event.data.friendship_id}`,
                        eventType: event.type,
                        actorUri: event.data.actor_uri,
                        displayName: event.data.display_name ?? event.data.username,
                        receivedAt: new Date().toISOString(),
                        friendshipId: event.data.friendship_id,
                    })
                    // When our friend request is accepted, refresh the friends list AND
                    // the DM conversation list — the accepter's IdP minted a DM row
                    // alongside `set_status('accepted')` so the conversation should
                    // appear in `localDmConvos` immediately, not on the next mount.
                    if (event.type === "friend_accepted" && idpUrl) {
                        queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
                        queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
                        queryClient.invalidateQueries({ queryKey: profileCardQueryKey(idpUrl, event.data.actor_uri) })
                    }
                    break
                }
                case "friend_removed": {
                    // Silent: an unfriend is never announced, the friend just
                    // leaves the list. The DM conversation stays, but its row
                    // is refetched with the list it shares a sidebar with.
                    if (idpUrl) {
                        queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
                        queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
                        queryClient.invalidateQueries({ queryKey: profileCardQueryKey(idpUrl, event.data.actor_uri) })
                    }
                    break
                }
                case "friend_profile_updated": {
                    // A friend's profile was updated — patch the central avatar map
                    // so every Avatar callsite (DM list, message authors, header)
                    // reflects the change live, and refresh queries that snapshot
                    // display name / member metadata.
                    const address = actorUriToAddress(event.data.actorUri)
                    actionsRef.current.setAvatarFor(address, event.data.avatarUrl)
                    if (idpUrl) {
                        queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
                        queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
                        queryClient.invalidateQueries({ queryKey: profileCardQueryKey(idpUrl, event.data.actorUri) })
                    }
                    break
                }
            }
        })

        // The IdP ended the session: a renewal says whether it is over for this page too.
        wsPort.onSessionEnded(() => {
            void renewAccessToken().then((token) => {
                if (token) wsPort.connect(idpUrl, currentToken)
            })
        })
        wsPort.connect(idpUrl, currentToken)

        return () => {
            wsPort.disconnect()
        }
    }, [signedIn, idpUrl])
}
