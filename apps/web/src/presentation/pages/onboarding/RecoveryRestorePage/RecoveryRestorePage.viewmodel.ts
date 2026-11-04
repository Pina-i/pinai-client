import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

import { reactionsToReplay, type RestoredMessage } from "@pinai/domain/models/history-archive"
import { addressParts } from "@pinai/domain/models/identity"
import { restoreHistoryFromPassphraseUseCase } from "@pinai/domain/usecases/e2ee/restore-history-from-passphrase.usecase"
import { registerIdentityUseCase } from "@pinai/domain/usecases/e2ee/register-identity.usecase"
import { setUpThisDeviceUseCase } from "@pinai/domain/usecases/e2ee/set-up-this-device.usecase"
import { getDeviceDirectoryPort, getE2eePort, getHistoryArchivePort, getSessionPort } from "@/ioc"
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
 * The device is set up silently on mount — registered, named on its session,
 * its KeyPackages published — so both "Restore" and "Start fresh" exit with a
 * fully-set-up device. The words are checked against the account's history key
 * before anything is kept; right, the device approves itself with them and
 * reports its generation, then the archive is restored.
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
        const e2eePort = getE2eePort()
        bootstrapRef.current = (async () => {
            await setUpThisDeviceUseCase({ e2eePort, sessionPort: getSessionPort() })(idpUrl, accessToken, ownActorUri)
            await registerIdentityUseCase({ e2eePort })({ idpUrl, accessToken, actorUri: ownActorUri })
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
        if (!idpUrl || !accessToken || !ownActorUri || !canRestore) return
        setStatus("restoring")
        setError(null)
        try {
            if (bootstrapRef.current) await bootstrapRef.current

            const result = await restoreHistoryFromPassphraseUseCase({
                e2eePort: getE2eePort(),
                sessionPort: getSessionPort(),
                historyArchivePort: getHistoryArchivePort(),
                deviceDirectoryPort: getDeviceDirectoryPort(),
            })({ idpUrl, accessToken, actorUri: ownActorUri, passphrase: words })

            if (result.kind !== "restored") {
                setStatus("ready")
                toast.error(REFUSALS[result.kind])
                return
            }
            setRestored(result.messages.length)
            setSkipped(result.skipped)

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

            setStatus("done")
            toast.success(
                result.messages.length === 0
                    ? "Device set up"
                    : `Restored ${result.messages.length} message${result.messages.length === 1 ? "" : "s"}`,
            )
            void navigate({ to: "/home" })
        } catch (e) {
            if (await signInAgainOnDeviceMismatch(e)) return
            setStatus("error")
            setError(e instanceof Error ? e.message : "Restore failed")
        }
    }, [idpUrl, accessToken, ownActorUri, canRestore, words, navigate])

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

const REFUSALS = {
    "wrong-passphrase": "Wrong passphrase — these aren't your account's 24 words",
    "key-swapped": "Your instance changed your history key — nothing was restored",
    "no-key": "Your account has no history passphrase yet",
    "rolled-back": "Your instance went back to an older history key — nothing was restored",
    "key-changed": "Your history key changed meanwhile — nothing was restored",
} as const

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
