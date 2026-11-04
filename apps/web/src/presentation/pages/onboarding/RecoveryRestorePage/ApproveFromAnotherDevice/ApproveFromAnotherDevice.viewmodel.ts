import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import type { DeviceKind } from "@pinai/domain/models/device"
import {
    RESTORE_WAIT_MS,
    SHARE_WAIT_AFTER_IN_MS,
    codeHalves,
    nextCodeWording,
    requestLifeLeft,
    type HandshakeFailure,
} from "@pinai/domain/models/approval-handshake"
import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import {
    ApprovalAsking,
    ApprovedEntry,
    type AskingState,
    type EnteringState,
} from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import type { HistoryRestoreState } from "@pinai/domain/usecases/e2ee/restore-due-history.usecase"
import { getApprovalRelayPort, getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { historyRestore, restoreDueHistory } from "@/presentation/_libs/history-restore"
import { devicesQueryKey } from "@/presentation/hooks/useDevices"
import { useAppStore } from "@/store/store"

export interface ApproveFromAnotherDeviceViewModel {
    state: AskingState
    /** The code as shown, 3 + 3; `null` while there is none. */
    halves: [string, string] | null
    /** The ring: the share of the code's life left, 0 to 1; `null` once someone answered it. */
    ringFraction: number | null
    /** "new in 8 min", until someone answers. */
    nextCode: string | null
    /** This device's label, as the instance names it. */
    thisDevice: string
    /** The account's other unrevoked devices, by name. */
    approvers: Array<{ deviceId: string; label: string; kind: DeviceKind }>
    /** One line on what is happening, what happened to the last code, or how the history is coming back. */
    status: string | null
    /** "New code" after one went, "Show a code" once set aside, "Go on without it" past a share it couldn't use; `null` when the page asks by itself. */
    action: "new-code" | "show-code" | "go-on" | null
    onAction: () => void
}

const STARTING: AskingState = { kind: "starting" }

// The requests this page load opened: its hourly budget outlives a remount (StrictMode, navigation).
const openedThisPageLoad: number[] = []

function warn(what: string) {
    return (error: unknown) => {
        // eslint-disable-next-line no-console
        console.warn(`[e2ee] ${what}`, error instanceof Error ? error.message : error)
    }
}

function wentWith(failure: HandshakeFailure): string {
    switch (failure) {
        case "wrong-code":
            return "That code didn't match on your other device."
        case "keys-refused":
            return "Your instance listed other keys for that device. Nothing was approved."
        case "tampered":
            return "Something changed the messages between your devices. Nothing was approved."
        case "expired":
            return "That code ran out after it was typed. Nothing was approved."
        default:
            return "That request ended without approving this device."
    }
}

/** What the line under the code says. */
export function askingStatus(state: AskingState): string | null {
    switch (state.kind) {
        case "starting":
            return "Asking your instance for a code…"
        case "showing":
            if (state.phase === "confirming") return "Your other device is checking the code…"
            if (state.phase === "approving") return "Approving this device…"
            return null
        case "waiting":
            if (state.why === "unreachable") return "Couldn't reach your instance. Trying again…"
            return `Too many codes asked for this hour. A new one at ${new Date(state.until).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            })}.`
        case "stopped":
            return wentWith(state.failure)
        case "paused":
            return "Typing your 24 words instead."
        case "approved":
            return "This device is approved."
        case "holds":
            return "This device already holds your history passphrase."
    }
}

const RESTORED_SHOWN_MS = 1_500

export interface Arrival {
    entering: EnteringState | null
    share: AwaitedShareState | null
    restore: HistoryRestoreState | null
}

/** What the line under the code says once the device is approved. */
export function arrivalStatus({ entering, share, restore }: Arrival): string {
    const isIn = entering?.kind === "in"
    if (share?.kind === "unusable") return "Approved, but your history couldn't be received from that device. Type your 24 words to bring it back."
    if (restore?.kind === "restored") return "Your history is back"
    if (restore?.kind === "failed") return "Approved. Your history comes back the next time Pīna'i starts."
    if (!isIn && (entering?.kind === "refused" || share?.kind === "ended")) return "Your instance refused to let this device in."
    if (!isIn && share?.kind !== "kept" && entering?.kind === "entering" && entering.waiting) {
        return "Approved. Waiting for your other device to finish: it hasn't yet said it holds your history passphrase."
    }
    return "Approved — bringing your history…"
}

/**
 * The "Another device" section of the restore page: being on screen is the user asking. A request
 * opens once the device is set up (`ready`); it ends when the section goes or the 24 words are
 * being typed (`wordsStarted`), and a code that went any way but unanswered waits for "New code".
 * Approved, the device publishes its KeyPackages once it is in (`registerIdentityUseCase`) while
 * the page reads its key share (`share`); the words kept, the restore runs and the page goes on
 * (`onIn`) once it settles, `RESTORE_WAIT_MS` at most. Let in with no share after
 * `SHARE_WAIT_AFTER_IN_MS`, it goes on without; a share it couldn't use stops it there.
 */
export function useApproveFromAnotherDeviceViewModel(input: {
    ready: boolean
    wordsStarted: boolean
    fallbackLabel: string
    /** The page's wait for this device's key share. */
    share?: AwaitedShareState | null
    onApproved?: () => void
    onIn?: () => void
}): ApproveFromAnotherDeviceViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const asking = useRef<ApprovalAsking | null>(null)
    const [state, setState] = useState<AskingState>(STARTING)
    const [now, setNow] = useState(() => Date.now())
    const [thisDeviceId, setThisDeviceId] = useState<string | null>(null)
    const { ready, wordsStarted } = input

    useEffect(() => {
        if (!ready || !signedIn || !idpUrl || !actorUri) return
        const made = new ApprovalAsking(
            { e2ee: getE2eePort(), relay: getApprovalRelayPort(), directory: getDeviceDirectoryPort() },
            { idpUrl, actorUri, accessToken: () => useAppStore.getState().accessToken, report: (what, e) => warn(what)(e) },
            openedThisPageLoad,
        )
        const unsubscribe = made.onChange(() => setState(made.state))
        let live = true
        let timer: ReturnType<typeof setTimeout> | undefined
        // One tick at a time, the next scheduled once it ends; none while the page is hidden.
        const tick = () => {
            clearTimeout(timer)
            if (!live || document.hidden) return
            made.tick()
                .catch(warn("reading the approval request"))
                .finally(() => {
                    if (live) timer = setTimeout(tick, made.nextDelay())
                })
        }
        const onVisible = () => {
            if (!document.hidden) tick()
        }
        const onPageHide = () => void made.stop({ keepalive: true }).catch(warn("ending the approval request"))
        document.addEventListener("visibilitychange", onVisible)
        window.addEventListener("pagehide", onPageHide)
        asking.current = made
        tick()
        return () => {
            live = false
            clearTimeout(timer)
            unsubscribe()
            document.removeEventListener("visibilitychange", onVisible)
            window.removeEventListener("pagehide", onPageHide)
            if (asking.current === made) asking.current = null
            void made.stop().catch(warn("ending the approval request"))
        }
    }, [ready, signedIn, idpUrl, actorUri])

    const onIn = useRef(input.onIn)
    const onApproved = useRef(input.onApproved)
    useEffect(() => {
        onIn.current = input.onIn
        onApproved.current = input.onApproved
    })
    const approved = state.kind === "approved"
    useEffect(() => {
        if (approved) onApproved.current?.()
    }, [approved])

    const [entering, setEntering] = useState<EnteringState | null>(null)
    useEffect(() => {
        if (!approved || !idpUrl || !actorUri) return
        const entry = new ApprovedEntry(admissionDeps(), {
            idpUrl,
            actorUri,
            accessToken: () => useAppStore.getState().accessToken,
            report: (what, e) => warn(what)(e),
        })
        return ticking(entry, () => setEntering(entry.state), async () => {
            const settled = entry.state
            if (settled.kind === "in") return true
            if (settled.kind === "refused") {
                if (!(await signInAgainOnDeviceMismatch(settled.error))) warn("letting this device in")(settled.error)
                return true
            }
            return false
        })
    }, [approved, idpUrl, actorUri])

    const share = input.share ?? null
    const arriving = approved && share?.kind === "kept"
    const [restore, setRestore] = useState<HistoryRestoreState | null>(null)
    useEffect(() => {
        if (!arriving) return
        let live = true
        let shown: ReturnType<typeof setTimeout> | undefined
        const goOn = () => {
            if (!live) return
            live = false
            onIn.current?.()
        }
        const running = historyRestore()
        const unsubscribe = running.onChange(() => setRestore(running.state))
        // Not awaited past the limit: the restore is the page load's, and carries on in the app.
        const limit = setTimeout(goOn, RESTORE_WAIT_MS)
        void restoreDueHistory().then((settled) => {
            if (!live) return
            setRestore(settled)
            if (settled.kind === "restored" || settled.kind === "failed") shown = setTimeout(goOn, RESTORED_SHOWN_MS)
            else if (settled.kind === "idle") goOn()
        })
        return () => {
            live = false
            clearTimeout(limit)
            clearTimeout(shown)
            unsubscribe()
        }
    }, [arriving])

    const isIn = entering?.kind === "in"
    const inWithoutWords = isIn && (share === null || share.kind === "waiting")
    useEffect(() => {
        if (!inWithoutWords) return
        const timer = setTimeout(() => onIn.current?.(), SHARE_WAIT_AFTER_IN_MS)
        return () => clearTimeout(timer)
    }, [inWithoutWords])

    // Typing the words is the user taking the other way: the request ends, "Show a code" brings one back.
    const wasStarted = useRef(wordsStarted)
    useEffect(() => {
        if (wordsStarted && !wasStarted.current) void asking.current?.pause().catch(warn("ending the approval request"))
        wasStarted.current = wordsStarted
    }, [wordsStarted])

    useEffect(() => {
        let live = true
        void getE2eePort()
            .getDeviceId()
            .then((id) => {
                if (live) setThisDeviceId(id)
            })
            .catch(warn("reading this device's id"))
        return () => {
            live = false
        }
    }, [])

    const counting = state.kind === "showing" && !state.answered
    useEffect(() => {
        if (!counting) return
        const timer = setInterval(() => setNow(Date.now()), 1_000)
        return () => clearInterval(timer)
    }, [counting])

    const { data: devices } = useQuery({
        queryKey: devicesQueryKey(idpUrl ?? ""),
        queryFn: async () => (await getDeviceDirectoryPort().listDevices(idpUrl!, useAppStore.getState().accessToken!)).devices,
        enabled: !!idpUrl && signedIn && ready,
    })

    const own = devices?.find((d) => d.device_id === thisDeviceId)
    const approvers = (devices ?? [])
        .filter((d) => d.device_id !== thisDeviceId && d.revoked_at === null)
        .map((d) => ({ deviceId: d.device_id, label: d.display_name || "Unnamed device", kind: d.kind }))
    const shown = state.kind === "showing" ? state : null

    return {
        state,
        halves: shown ? codeHalves(shown.code) : null,
        ringFraction: shown && !shown.answered ? requestLifeLeft(shown.deadline, now) : null,
        nextCode: shown && !shown.answered ? nextCodeWording(shown.deadline, now) : null,
        thisDevice: own?.display_name || input.fallbackLabel,
        approvers,
        status: approved ? arrivalStatus({ entering, share, restore }) : askingStatus(state),
        action:
            state.kind === "stopped"
                ? "new-code"
                : state.kind === "paused"
                  ? "show-code"
                  : approved && isIn && share?.kind === "unusable"
                    ? "go-on"
                    : null,
        onAction: () => {
            if (approved) onIn.current?.()
            else void asking.current?.again().catch(warn("asking for a new code"))
        },
    }
}

function ticking(work: { tick(): Promise<void>; nextDelay(): number; onChange(listener: () => void): () => void }, changed: () => void, done: () => Promise<boolean>) {
    const unsubscribe = work.onChange(changed)
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
        clearTimeout(timer)
        if (!live || document.hidden) return
        void work.tick().then(async () => {
            if (!live || (await done())) return
            clearTimeout(timer)
            timer = setTimeout(tick, work.nextDelay())
        })
    }
    const onVisible = () => {
        if (!document.hidden) tick()
    }
    document.addEventListener("visibilitychange", onVisible)
    tick()
    return () => {
        live = false
        clearTimeout(timer)
        unsubscribe()
        document.removeEventListener("visibilitychange", onVisible)
    }
}
