import { useCallback, useState } from "react"
import { useAppStore } from "@/store/store"
import type {
    ApplicationMessage,
    EditBody,
    ReactionBody,
} from "@/domain/models/e2ee"
import { getDmPort, getE2eePort } from "@/ioc"
import type { Message } from "@/lib/types"

/**
 * Decode a base64 string to bytes / encode bytes to base64. Same
 * helpers ride in the conversation viewmodel + WS hook; kept inline
 * here too rather than pulling a tiny utility module.
 */
function bytesToB64(bytes: Uint8Array): string {
    let s = ""
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    return btoa(s)
}

export function useMessageItemViewModel(
    message: Message,
    conversationKey: string,
    recipientAddress: string,
    onReply: (messageId: string) => void,
    onRetry: (messageId: string) => void,
    hasPendingIntent: (messageId: string) => boolean,
) {
    const user = useAppStore((s) => s.user)
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const updateDmConversation = useAppStore((s) => s.updateDmConversation)
    const updateMessageById = useAppStore((s) => s.updateMessageById)
    const applyReaction = useAppStore((s) => s.applyReaction)

    const currentDisplayName = user?.display_name ?? user?.preferred_username ?? ""
    const isOwn = message.author === currentDisplayName

    // ─── Edit state ───────────────────────────────────────────────────────────

    const [isEditing, setIsEditing] = useState(false)
    const [editInput, setEditInput] = useState("")

    const startEdit = useCallback(() => {
        setEditInput(message.content)
        setIsEditing(true)
    }, [message.content])

    const cancelEdit = useCallback(() => {
        setIsEditing(false)
        setEditInput("")
    }, [])

    const commitEdit = useCallback(async () => {
        const trimmed = editInput.trim()
        if (!trimmed || !accessToken || !idpUrl) {
            // Without auth we can still reflect locally but not send.
            updateDmConversation(conversationKey, (msgs) =>
                msgs.map((m) =>
                    m.id === message.id ? { ...m, content: trimmed, edited: true } : m,
                ),
            )
            setIsEditing(false)
            setEditInput("")
            return
        }

        const previousContent = message.content

        // Optimistic update.
        updateDmConversation(conversationKey, (msgs) =>
            msgs.map((m) => (m.id === message.id ? { ...m, content: trimmed, edited: true } : m)),
        )
        setIsEditing(false)
        setEditInput("")

        // Encrypt the edit envelope and PATCH. The PATCH replaces
        // the row's `mls_ciphertext` and stamps `edited_at`; the
        // server pushes a `message_edited` event to peers, who
        // decrypt to recover `new_text`.
        const editMessage: ApplicationMessage<EditBody> = {
            version: 1,
            kind: "edit",
            body: { target_message_id: message.id, new_text: trimmed },
        }
        try {
            const ciphertext = await getE2eePort().encryptOutbound(conversationKey, editMessage)
            await getDmPort().editMessage(idpUrl, accessToken, message.id, bytesToB64(ciphertext))
        } catch (e) {
            // Rollback on failure.
            // eslint-disable-next-line no-console
            console.warn("Edit send failed; rolling back:", e)
            updateMessageById(message.id, (m) => ({ ...m, content: previousContent }))
        }
    }, [
        editInput,
        message,
        conversationKey,
        accessToken,
        idpUrl,
        updateDmConversation,
        updateMessageById,
    ])

    // ─── Reaction ─────────────────────────────────────────────────────────────

    const handleReaction = useCallback(
        async (emoji: string) => {
            if (!user) return
            const wasReacted = message.reactions?.find((r) => r.emoji === emoji)?.reacted ?? false
            const op: "add" | "remove" = wasReacted ? "remove" : "add"

            const optimisticId = crypto.randomUUID()
            const reactorAddress = user.address

            // Optimistic toggle via the same applyReaction path the
            // WS / REST history paths use. Stamping a synthetic
            // `reaction_message_id` lets us dedup against the eventual
            // echo (we never see the synthetic id from the server, but
            // we DO see the server-assigned id, and the slice records
            // both as applied-once via the final id replacement
            // below).
            applyReaction(
                conversationKey,
                {
                    reaction_message_id: optimisticId,
                    target_message_id: message.id,
                    reactor_address: reactorAddress,
                    emoji,
                    op,
                },
                true,
            )

            if (!accessToken || !idpUrl) return

            // Routing: we use the `recipientAddress` passed in by the
            // conversation viewmodel (same source `sendMessage` uses —
            // `dmData?.address ?? name`). Looking it up via
            // `localDmConvos` here used to fail right after a
            // first-send because Bob's own WS echo skips the
            // conversation-list refetch (`isOwn` short-circuit), so
            // his store stayed empty.
            //
            // CRITICAL: bail BEFORE `encryptOutbound`. Each encrypt
            // advances the MLS send-side ratchet (forward secrecy
            // wipes the per-generation key), so an encrypt without
            // a delivered ciphertext leaves Bob's counter ahead of
            // Alice's recv-side — every subsequent message then
            // arrives with a gap, and once the gap exceeds openmls's
            // out-of-order tolerance window all later decrypts fail
            // with "secret deleted".
            if (!recipientAddress) {
                // eslint-disable-next-line no-console
                console.warn("Cannot send reaction: recipient address unknown")
                applyReaction(
                    conversationKey,
                    {
                        reaction_message_id: crypto.randomUUID(),
                        target_message_id: message.id,
                        reactor_address: reactorAddress,
                        emoji,
                        op: op === "add" ? "remove" : "add",
                    },
                    true,
                )
                return
            }

            // Encrypt + send via the regular DM REST path. Server
            // stores another `direct_messages` row; receivers'
            // `tryDecryptApp` projects it as a reaction.
            const reactionMessage: ApplicationMessage<ReactionBody> = {
                version: 1,
                kind: "reaction",
                body: { target_message_id: message.id, emoji, op },
            }
            try {
                const ciphertext = await getE2eePort().encryptOutbound(
                    conversationKey,
                    reactionMessage,
                )
                await getDmPort().sendMessage(
                    idpUrl,
                    accessToken,
                    recipientAddress,
                    bytesToB64(ciphertext),
                    undefined,
                    undefined,
                    undefined,
                )
            } catch (e) {
                // eslint-disable-next-line no-console
                console.warn("Reaction send failed; rolling back optimistic toggle:", e)
                // Revert by applying the inverse op with a fresh id.
                applyReaction(
                    conversationKey,
                    {
                        reaction_message_id: crypto.randomUUID(),
                        target_message_id: message.id,
                        reactor_address: reactorAddress,
                        emoji,
                        op: op === "add" ? "remove" : "add",
                    },
                    true,
                )
            }
        },
        [user, message, conversationKey, accessToken, idpUrl, applyReaction],
    )

    // ─── Delete ───────────────────────────────────────────────────────────────

    const handleDelete = useCallback(() => {
        updateDmConversation(conversationKey, (msgs) => msgs.filter((m) => m.id !== message.id))
    }, [message.id, conversationKey, updateDmConversation])

    // ─── Reply ────────────────────────────────────────────────────────────────

    const handleReply = useCallback(() => {
        onReply(message.id)
    }, [message.id, onReply])

    // ─── Retry (for status: "failed") ─────────────────────────────────────────

    const retrySend = useCallback(() => {
        onRetry(message.id)
    }, [message.id, onRetry])

    // Retry only works while the conversation viewmodel still holds
    // the send-intent in its in-memory map. After a reload the map is
    // empty → retry button stays rendered (status === "failed") but
    // disabled, telling the user the message couldn't be auto-resent.
    const canRetry = message.status === "failed" && hasPendingIntent(message.id)

    return {
        isOwn,
        isEditing,
        editInput,
        setEditInput,
        startEdit,
        cancelEdit,
        commitEdit,
        handleReaction,
        handleDelete,
        handleReply,
        retrySend,
        canRetry,
    }
}
