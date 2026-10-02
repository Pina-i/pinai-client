/**
 * Whether a message from the user's own account is this device's: one it holds a copy of — the
 * optimistic row under the id the client chose, the row under the id the server gave it, or the
 * reaction it applied. Any other came from one of the user's other devices and is decrypted like
 * anyone's. MLS never decrypts a device's own, so one that doesn't decrypt is this device's after
 * all, or older than it: there is nothing to show for it.
 */
export function isHeldHere(
    messages: readonly { id: string }[] | undefined,
    ids: { messageId: string; clientId?: string | null },
    appliedReactionIds: Readonly<Record<string, true>>,
): boolean {
    if (appliedReactionIds[ids.messageId]) return true
    return (messages ?? []).some(
        (m) => m.id === ids.messageId || (!!ids.clientId && m.id === ids.clientId),
    )
}
