import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { reactionsToReplay, type RestoredMessage } from "@pinai/domain/models/history-archive"
import { addressParts } from "@pinai/domain/models/identity"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { getE2eePort } from "@/ioc"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import type { Message } from "@/lib/types"
import type { RecoveryPassphraseInputHandle } from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"
import {
    RECOVERY_WORD_COUNT,
    isPassphraseComplete,
} from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput.helper"
import { useAppStore } from "@/store/store"

export type RestoreStatus = "initializing" | "ready" | "restoring" | "done" | "error"

export interface RecoveryRestoreViewModel {
    status: RestoreStatus
    /** Display name for the welcome chip — falls back to handle, then "you". */
    welcomeName: string
    /** "Chrome on macOS" / "Web client" — decorative chip subtitle. */
    deviceLabel: string
    words: string[]
    setWords: (next: string[]) => void
    /** True when every slot holds a valid BIP-39 word. */
    canRestore: boolean
    /** Number of filled, valid slots — drives the "N / 24" pill. */
    filledCount: number
    restored: number
    skipped: number
    error: string | null
    /** Pass to `<RecoveryPassphraseInput handleRef=...>` so `onPaste` can focus the first slot. */
    inputHandleRef: RefObject<RecoveryPassphraseInputHandle | null>
    onPaste: () => void
    onClear: () => void
    onRestore: () => Promise<void>
    onStartFresh: () => void
}

/**
 * History restore on a new device.
 *
 * Bootstrap (MSK + Device Root Key) runs silently in the background on mount
 * so both "Restore" and "Start fresh" exit with a fully-set-up device. The
 * passphrase is only needed for decrypting the server-side archive — without
 * it the user can still chat, but messages from before today won't follow
 * them here.
 */
export function useRecoveryRestorePageViewModel(): RecoveryRestoreViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const accessToken = useAppStore((s) => s.accessToken)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const user = useAppStore((s) => s.user)
    const navigate = useNavigate()

    const [status, setStatus] = useState<RestoreStatus>("initializing")
    const [words, setWords] = useState<string[]>(() =>
        Array.from({ length: RECOVERY_WORD_COUNT }, () => ""),
    )
    const [restored, setRestored] = useState(0)
    const [skipped, setSkipped] = useState(0)
    const [error, setError] = useState<string | null>(null)

    // Bootstrap promise — both action handlers await it before running their
    // own work so an impatient user clicking Restore mid-bootstrap doesn't
    // race with the silent register/registerDevice calls.
    const bootstrapRef = useRef<Promise<void> | null>(null)
    const inputHandleRef = useRef<RecoveryPassphraseInputHandle | null>(null)

    const ownActorUri = user?.actor_uri ?? null
    useEffect(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !ownActorUri) return
        const port = getE2eePort()
        // Already done in a previous mount on the same session — just
        // open the input.
        bootstrapRef.current = (async () => {
            if (await port.hasLocalIdentity()) {
                await port.registerDevice(idpUrl, accessToken, ownActorUri)
                return
            }
            await port.register(idpUrl, accessToken, ownActorUri)
        })()
        let cancelled = false
        bootstrapRef.current
            .then(() => {
                if (!cancelled) setStatus("ready")
            })
            .catch(async (e: unknown) => {
                if (cancelled || (await signInAgainOnDeviceMismatch(e))) return
                setStatus("error")
                setError(e instanceof Error ? e.message : "Could not set up this device.")
            })
        return () => {
            cancelled = true
        }
    }, [idpUrl, signedIn, ownActorUri])

    const canRestore = useMemo(() => isPassphraseComplete(words), [words])
    const filledCount = useMemo(
        () => words.reduce((n, w) => (w ? n + 1 : n), 0),
        [words],
    )

    // Reading the clipboard via `navigator.clipboard.readText()` is gated
    // by per-browser permissions (Firefox blocks it on regular pages
    // entirely). Focusing the first slot is universal — the input
    // molecule's own paste handler fans the 24 words across slots when
    // the user hits Ctrl/Cmd-V.
    const onPaste = useCallback(() => {
        inputHandleRef.current?.focusFirstSlot()
        toast.message("Press Ctrl-V (Cmd-V on Mac) to paste your passphrase")
    }, [])

    const onClear = useCallback(() => {
        setWords(Array.from({ length: RECOVERY_WORD_COUNT }, () => ""))
    }, [])

    const onRestore = useCallback(async () => {
        if (!idpUrl || !accessToken || !canRestore) return
        setStatus("restoring")
        setError(null)
        try {
            // Make sure bootstrap finished before we hit the archive.
            // restoreHistoryFromPassphrase doesn't strictly need MSK, but
            // the user is about to land on /home where the rest of the
            // app expects a complete device.
            if (bootstrapRef.current) await bootstrapRef.current

            const result = await restoreHistoryFromPassphraseUseCase({
                e2eePort: getE2eePort(),
            })({ idpUrl, accessToken, passphrase: words })

            setRestored(result.messages.length)
            setSkipped(result.skipped)

            if (result.decrypted === 0 && result.skipped > 0) {
                setStatus("ready")
                toast.error("Wrong passphrase — no entries decrypted")
                return
            }

            const byConversation = new Map<string, RestoredMessage[]>()
            for (const m of result.messages) {
                const list = byConversation.get(m.conversationId) ?? []
                list.push(m)
                byConversation.set(m.conversationId, list)
            }
            const store = useAppStore.getState()
            const me = store.user?.address
            for (const [conversationId, restored] of byConversation) {
                const replay = reactionsToReplay(store.dmMessages[conversationId] ?? [], restored)
                store.seedDmMessages(conversationId, restored.map(restoredToMessage))
                // Through the live path, which records each id: history may decrypt one of them again.
                for (const { messageId, reaction } of replay) {
                    store.applyReaction(
                        conversationId,
                        {
                            reaction_message_id: reaction.id,
                            target_message_id: messageId,
                            reactor_address: reaction.reactorAddress,
                            emoji: reaction.emoji,
                            op: "add",
                        },
                        reaction.reactorAddress === me,
                    )
                }
            }

            // Persist the verified passphrase locally so Settings → Devices
            // can reveal it and the history flusher can encrypt new entries.
            await getE2eePort().saveStoredPassphrase(words)
            setStatus("done")
            toast.success(
                result.messages.length === 0
                    ? "Device set up"
                    : `Restored ${result.messages.length} message${result.messages.length === 1 ? "" : "s"}`,
            )
            void navigate({ to: "/home" })
        } catch (e) {
            setStatus("error")
            setError(e instanceof Error ? e.message : "Restore failed")
        }
    }, [idpUrl, accessToken, canRestore, words, navigate])

    const onStartFresh = useCallback(async () => {
        try {
            if (bootstrapRef.current) await bootstrapRef.current
        } catch {
            // Bootstrap failures already surfaced via setStatus("error");
            // navigate anyway so the user isn't stuck — the gate will
            // route them back here next mount if needed.
        }
        void navigate({ to: "/home" })
    }, [navigate])

    const welcomeName =
        user?.display_name?.trim() ||
        user?.preferred_username?.trim() ||
        user?.address?.split("@")[0] ||
        "you"

    const deviceLabel = useMemo(() => summariseUserAgent(), [])

    return {
        status,
        welcomeName,
        deviceLabel,
        words,
        setWords,
        canRestore,
        filledCount,
        restored,
        skipped,
        error,
        inputHandleRef,
        onPaste,
        onClear,
        onRestore: onRestore as () => Promise<void>,
        onStartFresh,
    }
}

function restoredToMessage(m: RestoredMessage): Message {
    const author = m.senderDisplayName?.trim() || addressParts(m.senderAddress).handle || "Restored"
    return {
        id: m.id,
        author,
        authorAddress: m.senderAddress,
        avatar: author.slice(0, 2).toUpperCase(),
        content: m.text,
        timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        createdAt: m.createdAt,
        color: "#a78bfa",
        ...(m.edited ? { edited: true } : {}),
        attachments: m.attachments,
        ...(m.attachmentKeys.length > 0
            ? { attachmentKeys: Object.fromEntries(m.attachmentKeys.map((k) => [k.id, k])) }
            : {}),
        ...(m.replyTo ? { replyTo: m.replyTo } : {}),
    }
}

/**
 * Coarse browser+OS label mirroring the IdP's server-side UA parser.
 * Decorative — never used as an identifier. Returns "Web client" when
 * nothing matches.
 */
function summariseUserAgent(): string {
    if (typeof navigator === "undefined") return "Web client"
    const ua = navigator.userAgent
    if (!ua) return "Web client"

    const os = ua.includes("Mac OS X") || ua.includes("macOS")
        ? "macOS"
        : ua.includes("Windows")
          ? "Windows"
          : ua.includes("Android")
            ? "Android"
            : ua.includes("iPhone")
              ? "iOS"
              : ua.includes("iPad")
                ? "iPadOS"
                : ua.includes("Linux")
                  ? "Linux"
                  : "this device"

    const browser = ua.includes("Edg/") || ua.includes("Edge/")
        ? "Edge"
        : ua.includes("OPR/") || ua.includes("Opera/")
          ? "Opera"
          : ua.includes("Firefox/")
            ? "Firefox"
            : ua.includes("Chrome/")
              ? "Chrome"
              : ua.includes("Safari/")
                ? "Safari"
                : "Web"

    return `${browser} on ${os}`
}
