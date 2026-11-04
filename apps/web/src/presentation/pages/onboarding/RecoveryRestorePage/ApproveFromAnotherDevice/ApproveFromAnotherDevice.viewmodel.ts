import { useQuery } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"

import type { DeviceKind } from "@pinai/domain/models/device"
import {
    codeHalves,
    nextCodeWording,
    requestLifeLeft,
    type HandshakeFailure,
} from "@pinai/domain/models/approval-handshake"
import {
    ApprovalAsking,
    ApprovedEntry,
    type AskingState,
    type EnteringState,
} from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { getApprovalRelayPort, getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
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
    /** One line on what is happening, or what happened to the last code. */
    status: string | null
    /** Approved, the headline says it: the line is shown only when it says more. */
    statusShown: boolean
    /** "New code" after one went, "Show a code" once set aside; `null` when the page asks by itself. */
    action: "new-code" | "show-code" | null
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

/** What the line under the code says once the device is approved, on its way in. */
export function enteringStatus(entering: EnteringState): string {
    switch (entering.kind) {
        case "entering":
            return entering.waiting
                ? "Approved. Waiting for your other device to finish: it hasn't yet said it holds your history passphrase."
                : "This device is approved. Letting it in…"
        case "in":
            return "This device is approved."
        case "refused":
            return "Your instance refused to let this device in."
    }
}

/**
 * The "Another device" section of the restore page: being on screen is the user asking. A request
 * opens once the device is set up (`ready`); it ends when the section goes or the 24 words are
 * being typed (`wordsStarted`), and a code that went any way but unanswered waits for "New code".
 * Approved, the device publishes its KeyPackages once it is in (`registerIdentityUseCase`), then
 * goes on (`onIn`).
 */
export function useApproveFromAnotherDeviceViewModel(input: {
    ready: boolean
    wordsStarted: boolean
    fallbackLabel: string
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
    useEffect(() => {
        onIn.current = input.onIn
    })
    const approved = state.kind === "approved"
    const [entering, setEntering] = useState<EnteringState | null>(null)
    useEffect(() => {
        if (!approved || !idpUrl || !actorUri) return
        const entry = new ApprovedEntry(admissionDeps(), {
            idpUrl,
            actorUri,
            accessToken: () => useAppStore.getState().accessToken,
            report: (what, e) => warn(what)(e),
        })
        const unsubscribe = entry.onChange(() => setEntering(entry.state))
        let live = true
        let timer: ReturnType<typeof setTimeout> | undefined
        // One tick at a time, the next after its backoff; none while the page is hidden.
        const tick = () => {
            clearTimeout(timer)
            if (!live || document.hidden) return
            void entry.tick().then(async () => {
                if (!live) return
                const settled = entry.state
                if (settled.kind === "in") return onIn.current?.()
                if (settled.kind === "refused") {
                    if (!(await signInAgainOnDeviceMismatch(settled.error))) warn("letting this device in")(settled.error)
                    return
                }
                clearTimeout(timer)
                timer = setTimeout(tick, entry.nextDelay())
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
    }, [approved, idpUrl, actorUri])

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
        status: approved && entering ? enteringStatus(entering) : askingStatus(state),
        statusShown: !approved || entering?.kind === "refused" || (entering?.kind === "entering" && entering.waiting),
        action: state.kind === "stopped" ? "new-code" : state.kind === "paused" ? "show-code" : null,
        onAction: () => void asking.current?.again().catch(warn("asking for a new code")),
    }
}
