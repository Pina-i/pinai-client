import { useEffect, useLayoutEffect, useRef } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { useAppStore } from "@/store/store"
import { getDmPort, getE2eePort, getWsPort } from "@/ioc"
import type {
    ApplicationMessage,
    ArchiveEnvelope,
    AttachmentBlobKey,
    EditBody,
    ReactionBody,
    TextBody,
} from "@pinai/domain/models/e2ee"
import type { WsConnectionStatus, WsServerEvent } from "@pinai/domain/models/ws"
import type { Message } from "@/lib/types"
import { actorUriToAddress } from "@pinai/domain/models/identity"
import { TYPING_INDICATOR_TTL_MS } from "@/store/slices/presence.slice"
import { friendsQueryKey } from "@/presentation/pages/home/FriendsPanel/FriendsPanel.viewmodel"
import { dmConversationsQueryKey } from "@/presentation/hooks/useLoadDmConversations"
import { groupMembersQueryKey } from "@/presentation/pages/home/GroupMembersPanel/GroupMembersPanel.viewmodel"
import { playDmNotificationSound } from "@/presentation/_libs/notification-sound"

const UNDECRYPTABLE_PLACEHOLDER = "[encrypted]"

/** Module-level slot — `useDeviceFanout` registers its callback here. */
const deviceFanoutHandlerRef: { current: ((e: import("@pinai/domain/models/ws").DeviceJoinedPayload) => void) | null } = {
    current: null,
}

export function registerDeviceFanoutHandler(
    handler: (e: import("@pinai/domain/models/ws").DeviceJoinedPayload) => void,
): () => void {
    deviceFanoutHandlerRef.current = handler
    return () => {
        if (deviceFanoutHandlerRef.current === handler) {
            deviceFanoutHandlerRef.current = null
        }
    }
}

function b64ToBytes(s: string): Uint8Array {
    const bin = atob(s)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
}

/**
 * Decrypt an inbound MLS ciphertext for a conversation; soft-fails to
 * null on errors (no group state, MLS error, malformed JSON). Caller
 * dispatches on `app.kind` to route text / reaction / edit / reply.
 *
 * When `catchUp` is provided, the underlying port falls back to
 * fetching missing commits via REST and replaying them once before
 * giving up — the standard remedy for "we got an application message
 * one epoch ahead of the commit that introduced it".
 */
async function tryDecryptAny(
    conversationId: string,
    mlsCiphertextB64: string,
    catchUp?: { idpUrl: string; accessToken: string },
): Promise<ApplicationMessage | null> {
    try {
        const ct = b64ToBytes(mlsCiphertextB64)
        return await getE2eePort().decryptInbound(conversationId, ct, catchUp)
    } catch {
        return null
    }
}

/** Narrow `tryDecryptAny` to a single expected kind — convenience. */
async function tryDecryptKind<K extends ApplicationMessage["kind"]>(
    conversationId: string,
    mlsCiphertextB64: string,
    expectedKind: K,
    catchUp?: { idpUrl: string; accessToken: string },
): Promise<ApplicationMessage | null> {
    const app = await tryDecryptAny(conversationId, mlsCiphertextB64, catchUp)
    return app && app.kind === expectedKind ? app : null
}

/**
 * Manages the IdP WebSocket lifecycle.
 * Connects when authenticated, disconnects on logout or unmount.
 * Dispatches incoming events to the Zustand store.
 */
export function useIdpWebSocket(): void {
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const user = useAppStore((s) => s.user)
    const setWsStatus = useAppStore((s) => s.setWsStatus)
    const pushDmMessage = useAppStore((s) => s.pushDmMessage)
    const reconcileDmMessage = useAppStore((s) => s.reconcileDmMessage)
    const updateDmMessage = useAppStore((s) => s.updateDmMessage)
    const addNotification = useAppStore((s) => s.addNotification)
    const incrementDmUnread = useAppStore((s) => s.incrementDmUnread)
    const updateMessageById = useAppStore((s) => s.updateMessageById)
    const applyReaction = useAppStore((s) => s.applyReaction)
    const activeDm = useAppStore((s) => s.activeDm)
    const setPresence = useAppStore((s) => s.setPresence)
    const addTyping = useAppStore((s) => s.addTyping)
    const setAvatarFor = useAppStore((s) => s.setAvatarFor)
    const queryClient = useQueryClient()

    // Use refs for store actions to avoid stale closures in adapter callbacks.
    // The ref is seeded at mount and refreshed in a layout effect rather than
    // during render: writing `.current` while rendering is impure, and a render
    // React discards would leave the ref holding values that were never
    // committed. `useLayoutEffect` runs before paint, so the WS callbacks —
    // which only ever fire from async network events — never observe a stale
    // snapshot.
    const actions = {
        setWsStatus,
        pushDmMessage,
        reconcileDmMessage,
        updateDmMessage,
        addNotification,
        incrementDmUnread,
        updateMessageById,
        applyReaction,
        activeDm,
        user,
        setPresence,
        addTyping,
        setAvatarFor,
    }
    const actionsRef = useRef(actions)
    useLayoutEffect(() => {
        actionsRef.current = actions
    })

    useEffect(() => {
        if (!accessToken || !idpUrl) return

        const wsPort = getWsPort()

        wsPort.onStatusChange((status: WsConnectionStatus) => {
            actionsRef.current.setWsStatus(status)
        })

        wsPort.onEvent(async (event: WsServerEvent) => {
            // heartbeat_ack is purely a keep-alive — no UI side effect.
            if (event.type === "heartbeat_ack") return

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
                    actionsRef.current.addTyping(
                        event.data.conversationId,
                        event.data.actorUri,
                        Date.now() + TYPING_INDICATOR_TTL_MS,
                    )
                    break
                }
                case "new_dm": {
                    const conversationId = event.data.conversation_id
                    const senderAddress = actorUriToAddress(event.data.sender_address)
                    // The server fans `new_dm` out to the sender too
                    // (echo path in `idp-messaging::handlers`). We must
                    // NEVER try to decrypt our own ciphertext — MLS
                    // wipes the per-generation send-side key the moment
                    // we encrypt for forward secrecy, so a re-decrypt
                    // surfaces as "secret deleted" + leaves an
                    // `[encrypted]` placeholder in the conversation.
                    // `isOwnEcho` is the narrower predicate (we can
                    // reconcile an optimistic message via `client_id`);
                    // `isOwn` is the safety gate around decrypt.
                    const isOwn = senderAddress === actionsRef.current.user?.address
                    const isOwnEcho = isOwn && !!event.data.client_id

                    const catchUp =
                        idpUrl && accessToken ? { idpUrl, accessToken } : undefined

                    // Decrypt once — soft-fail to null. The kind tells
                    // us how to project this message into the UI: text
                    // (and replies) become a Message; reactions
                    // mutate an existing target's reactions[]; edits
                    // arrive on the message_edited event so we never
                    // see them here.
                    const app = isOwn
                        ? null
                        : await tryDecryptAny(conversationId, event.data.mls_ciphertext, catchUp)

                    if (app && app.kind === "reaction") {
                        const body = app.body as ReactionBody
                        if (
                            body &&
                            typeof body.target_message_id === "string" &&
                            typeof body.emoji === "string" &&
                            (body.op === "add" || body.op === "remove")
                        ) {
                            actionsRef.current.applyReaction(
                                conversationId,
                                {
                                    reaction_message_id: event.data.message_id,
                                    target_message_id: body.target_message_id,
                                    reactor_address: senderAddress,
                                    emoji: body.emoji,
                                    op: body.op,
                                },
                                senderAddress === actionsRef.current.user?.address,
                            )
                        }
                        break
                    }

                    // Default: text (or reply) — render as a Message.
                    let plaintext = UNDECRYPTABLE_PLACEHOLDER
                    let inlineReplyMeta: { content: string; author: string } | null = null
                    let attachmentKeys: Record<string, AttachmentBlobKey> | undefined
                    if (app && app.kind === "text") {
                        const body = app.body as TextBody
                        if (typeof body?.text === "string") plaintext = body.text
                        if (
                            body?.reply_meta &&
                            typeof body.reply_meta.preview_text === "string" &&
                            typeof body.reply_meta.preview_sender === "string"
                        ) {
                            inlineReplyMeta = {
                                content: body.reply_meta.preview_text,
                                author: body.reply_meta.preview_sender,
                            }
                        }
                        if (Array.isArray(body?.attachments) && body.attachments.length > 0) {
                            attachmentKeys = {}
                            for (const k of body.attachments) attachmentKeys[k.id] = k
                        }
                    }

                    const senderDisplayName =
                        event.data.sender_display_name ?? senderAddress.split("@")[0] ?? "?"

                    if (isOwnEcho) {
                        // Sender side — pull the optimistic message
                        // out of the store so we can preserve its
                        // plaintext (MLS forward secrecy means we
                        // can't re-decrypt our own ciphertext).
                        // Carries `status: "sent"` so the inline
                        // MessageStatus indicator flips out of the
                        // clock state. If the WS echo arrives after
                        // a `failed` flip (REST returned an error
                        // but the server actually persisted), the
                        // reconcile heals the row forward to "sent".
                        const optimistic = useAppStore
                            .getState()
                            .dmMessages[conversationId]?.find(
                                (m) => m.id === event.data.client_id,
                            )
                        actionsRef.current.reconcileDmMessage(
                            conversationId,
                            event.data.client_id!,
                            {
                                id: event.data.message_id,
                                author: senderDisplayName,
                                authorAddress: senderAddress,
                                avatar: senderDisplayName.slice(0, 2).toUpperCase(),
                                content: optimistic?.content ?? UNDECRYPTABLE_PLACEHOLDER,
                                timestamp: new Date(event.data.created_at).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                }),
                                createdAt: event.data.created_at,
                                color: "#a78bfa",
                                attachments: event.data.attachments,
                                status: "sent",
                                statusAt: new Date().toISOString(),
                                ...(optimistic?.replyTo ? { replyTo: optimistic.replyTo } : {}),
                            },
                        )

                        // Buffer the outbound message for the history
                        // archive. Forward secrecy wipes the
                        // send-side ratchet, so we can't re-decrypt
                        // our own ciphertext later — this is the only
                        // moment we have both the server's message_id
                        // and the plaintext together. Without this,
                        // restore-from-passphrase on a new device only
                        // surfaces peer messages.
                        if (optimistic) {
                            try {
                                const body: TextBody = { text: optimistic.content }
                                if (optimistic.replyTo) {
                                    body.reply_meta = {
                                        target_message_id: optimistic.replyTo.id,
                                        preview_text: optimistic.replyTo.content,
                                        preview_sender: optimistic.replyTo.author,
                                    }
                                }
                                if (optimistic.attachmentKeys) {
                                    body.attachments = Object.values(optimistic.attachmentKeys)
                                }
                                const app: ApplicationMessage<TextBody> = {
                                    version: 1,
                                    kind: "text",
                                    body,
                                }
                                const envelope: ArchiveEnvelope = {
                                    v: 1,
                                    sender_address: senderAddress,
                                    sender_display_name: senderDisplayName,
                                    created_at: event.data.created_at,
                                    app,
                                }
                                const serialized = new TextEncoder().encode(JSON.stringify(envelope))
                                getE2eePort().bufferDecryptedForArchive(
                                    conversationId,
                                    event.data.message_id,
                                    serialized,
                                )
                            } catch (err) {
                                // eslint-disable-next-line no-console
                                console.warn("[history-archive] own-echo buffer failed", err)
                            }
                        }
                        break
                    }
                    if (isOwn) {
                        // Own message echoed back without a `client_id`
                        // (REST send path; the server's `POST /api/dm`
                        // doesn't propagate the client UUID today — see
                        // the Phase 6 follow-up). The REST response
                        // already reconciled the optimistic row to
                        // `"sent"`. If the row is still `"sending"` or
                        // `"failed"` (REST never returned / network
                        // blip after server-side success), heal it
                        // forward to `"sent"` using `message_id` as
                        // the lookup key.
                        const existing = useAppStore
                            .getState()
                            .dmMessages[conversationId]?.find(
                                (m) => m.id === event.data.message_id,
                            )
                        if (existing && (existing.status === "sending" || existing.status === "failed")) {
                            actionsRef.current.updateDmMessage(
                                conversationId,
                                event.data.message_id,
                                {
                                    status: "sent",
                                    statusAt: new Date().toISOString(),
                                },
                            )
                        }
                        break
                    }

                    const msg: Message = {
                        id: event.data.message_id,
                        author: senderDisplayName,
                        authorAddress: senderAddress,
                        avatar: senderDisplayName.slice(0, 2).toUpperCase(),
                        content: plaintext,
                        timestamp: new Date(event.data.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        }),
                        createdAt: event.data.created_at,
                        color: "#a78bfa",
                        attachments: event.data.attachments,
                        attachmentKeys,
                    }
                    if (event.data.reply_to_id && inlineReplyMeta) {
                        msg.replyTo = {
                            id: event.data.reply_to_id,
                            content: inlineReplyMeta.content,
                            author: inlineReplyMeta.author,
                        }
                    } else if (event.data.reply_to_id) {
                        // Server-visible parent ID without a decrypted
                        // preview — render a slim "↩ replied" hint.
                        msg.replyTo = {
                            id: event.data.reply_to_id,
                            content: "",
                            author: "",
                        }
                    }

                    actionsRef.current.pushDmMessage(conversationId, msg)

                    // Buffer the full envelope so restore can rehydrate
                    // it with proper author/timestamp metadata.
                    if (app) {
                        try {
                            const envelope: ArchiveEnvelope = {
                                v: 1,
                                sender_address: senderAddress,
                                sender_display_name: senderDisplayName,
                                created_at: event.data.created_at,
                                app,
                            }
                            const serialized = new TextEncoder().encode(JSON.stringify(envelope))
                            getE2eePort().bufferDecryptedForArchive(
                                conversationId,
                                event.data.message_id,
                                serialized,
                            )
                        } catch (err) {
                            // eslint-disable-next-line no-console
                            console.warn("[history-archive] buffer push failed", err)
                        }
                    }

                    const isActive = actionsRef.current.activeDm === conversationId

                    // Sound plays whether or not the user is in this
                    // conversation — confirms the message arrived even
                    // when they're looking elsewhere on screen. DND
                    // status suppresses it entirely.
                    if (useAppStore.getState().myStatus !== "dnd") {
                        playDmNotificationSound()
                    }

                    if (isActive) {
                        // User is currently reading this conversation —
                        // tell the server so its `unread_count` stays at
                        // 0. Without this, the next `dm-conversations`
                        // refresh would report unread=1 and the badge /
                        // bubble would re-appear the moment the user
                        // navigates away. Fire-and-forget — failure is
                        // logged but doesn't surface to the user.
                        if (idpUrl && accessToken) {
                            getDmPort()
                                .markConversationRead(idpUrl, accessToken, conversationId)
                                .catch((e) => {
                                    // eslint-disable-next-line no-console
                                    console.warn("markConversationRead failed:", e)
                                })
                                .finally(() => {
                                    // Invalidate AFTER the read marker lands so
                                    // the refetch picks up the updated
                                    // `unread_count`.
                                    if (idpUrl) {
                                        queryClient.invalidateQueries({
                                            queryKey: dmConversationsQueryKey(idpUrl),
                                        })
                                    }
                                })
                        } else if (idpUrl) {
                            queryClient.invalidateQueries({
                                queryKey: dmConversationsQueryKey(idpUrl),
                            })
                        }
                    } else {
                        actionsRef.current.incrementDmUnread(conversationId)
                        if (idpUrl) {
                            queryClient.invalidateQueries({
                                queryKey: dmConversationsQueryKey(idpUrl),
                            })
                        }
                    }
                    break
                }
                case "message_edited": {
                    const { message_id, new_mls_ciphertext } = event.data
                    // We don't know which conversation the edit came
                    // from — try every open conversation in turn. In
                    // practice each ciphertext can only decrypt under
                    // its own group state.
                    const conversationKeys = Object.keys(useAppStore.getState().dmMessages)
                    let newText = UNDECRYPTABLE_PLACEHOLDER
                    const catchUp =
                        idpUrl && accessToken ? { idpUrl, accessToken } : undefined
                    for (const convKey of conversationKeys) {
                        const app = await tryDecryptKind(convKey, new_mls_ciphertext, "edit", catchUp)
                        if (app) {
                            const body = app.body as EditBody
                            if (body?.target_message_id === message_id && typeof body.new_text === "string") {
                                newText = body.new_text
                                break
                            }
                        }
                    }
                    actionsRef.current.updateMessageById(message_id, (m) => ({
                        ...m,
                        content: newText,
                        edited: true,
                    }))
                    break
                }
                case "mls_welcome_ready": {
                    // A peer just dropped a Welcome bundle in our
                    // queue (same-IdP via POST /api/mls/welcomes, or
                    // cross-IdP via the AP inbox). Pull + join now
                    // rather than waiting for the next login poll.
                    const ownActorUri = actionsRef.current.user?.actor_uri
                    if (!ownActorUri || !idpUrl || !accessToken) break
                    try {
                        const { joined } = await getE2eePort().consumePendingWelcomes(
                            idpUrl,
                            accessToken,
                            ownActorUri,
                        )
                        // A federated group is materialised server-side by the
                        // same inbound Note, so the list has a row to show now.
                        if (joined > 0) {
                            queryClient.invalidateQueries({ queryKey: dmConversationsQueryKey(idpUrl) })
                        }
                    } catch (e) {
                        // eslint-disable-next-line no-console
                        console.warn("WS-triggered welcome consumption failed:", e)
                    }
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
                    break
                }
                case "device_joined": {
                    // useDeviceFanout owns the actual fanout via its registered ref.
                    deviceFanoutHandlerRef.current?.(event.data)
                    break
                }
                case "friend_request":
                case "friend_accepted":
                case "friend_removed": {
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
                    }
                    // When a friend is removed, also refresh.
                    if (event.type === "friend_removed" && idpUrl) {
                        queryClient.invalidateQueries({ queryKey: friendsQueryKey(idpUrl) })
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
                    }
                    break
                }
            }
        })

        // Build WebSocket URL: convert http(s) scheme to ws(s).
        const wsUrl = `${idpUrl.replace(/^http/, "ws")}/ws?token=${accessToken}`
        wsPort.connect(wsUrl)

        return () => {
            wsPort.disconnect()
        }
    }, [accessToken, idpUrl])
}
