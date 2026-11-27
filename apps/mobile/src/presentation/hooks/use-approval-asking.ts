import { ApprovalAsking, ApprovedEntry, type AskingState, type EnteringState } from "@pinai/domain/usecases/e2ee/approval-handshake.usecase"
import { useEffect, useRef, useState } from "react"
import { getApprovalRelayPort, getDeviceDirectoryPort, getE2eePort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { appVisibility } from "@/presentation/_libs/app-visibility"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import { useAppStore } from "@/store/store"

// The requests this launch opened: the hourly budget outlives the screen.
const openedThisLaunch: number[] = []

const warn = (what: string) => (error: unknown) => warnE2ee(what, error)

interface Ticking {
    tick(): Promise<void>
    nextDelay(): number
}

/** One tick at a time, the next once it ends; none while the app isn't in front, one at once when it comes back. */
function tickInFront(work: Ticking, failed: (error: unknown) => void, done: () => Promise<boolean> = async () => false): () => void {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
        clearTimeout(timer)
        if (!live || !appVisibility.visible()) return
        work.tick()
            .catch(failed)
            .then(async () => {
                if (!live || (await done())) return
                clearTimeout(timer)
                timer = setTimeout(tick, work.nextDelay())
            })
    }
    const stopWatching = appVisibility.onChange(() => {
        if (appVisibility.visible()) tick()
    })
    tick()
    return () => {
        live = false
        clearTimeout(timer)
        stopWatching()
    }
}

/**
 * The domain's `ApprovalAsking` while the code is on screen: a request opens once the device is set up (`ready`) and the
 * way is shown (`active`); off it, a request nobody answered ends, and back on it a new one opens. Approved, the domain's
 * `ApprovedEntry` asks whether the device is in until it is, publishing its KeyPackages then.
 */
export function useApprovalAsking(ready: boolean, active: boolean) {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [state, setState] = useState<AskingState>({ kind: "starting" })
    const [entering, setEntering] = useState<EnteringState | null>(null)
    const asking = useRef<ApprovalAsking | null>(null)
    const resume = useRef<(() => void) | null>(null)
    const activeRef = useRef(active)

    useEffect(() => {
        if (!ready || !idpUrl || !actorUri) return
        const made = new ApprovalAsking(
            { e2ee: getE2eePort(), relay: getApprovalRelayPort(), directory: getDeviceDirectoryPort() },
            { idpUrl, actorUri, accessToken: () => useAppStore.getState().accessToken, report: warnE2ee },
            openedThisLaunch
        )
        const unsubscribe = made.onChange(() => setState(made.state))
        let stopTicking: (() => void) | null = null
        const start = () => {
            stopTicking?.()
            stopTicking = tickInFront(made, warn("reading the approval request"))
        }
        asking.current = made
        resume.current = () => {
            void made.again().catch(warn("asking for a new code"))
            start()
        }
        if (activeRef.current) start()
        return () => {
            stopTicking?.()
            unsubscribe()
            resume.current = null
            if (asking.current === made) asking.current = null
            void made.stop().catch(warn("ending the approval request"))
        }
    }, [ready, idpUrl, actorUri])

    // Another way chosen is the user leaving this one: the request ends. Coming back is asking again.
    useEffect(() => {
        if (active === activeRef.current) return
        activeRef.current = active
        if (active) resume.current?.()
        else void asking.current?.pause().catch(warn("ending the approval request"))
    }, [active])

    const approved = state.kind === "approved"
    useEffect(() => {
        if (!approved || !idpUrl || !actorUri) return
        const entry = new ApprovedEntry(admissionDeps(), { idpUrl, actorUri, accessToken: () => useAppStore.getState().accessToken, report: warnE2ee })
        const unsubscribe = entry.onChange(() => setEntering(entry.state))
        const stop = tickInFront(entry, warn("letting this device in"), async () => {
            const settled = entry.state
            if (settled.kind === "in") return true
            if (settled.kind === "refused") {
                if (!(await signInAgainOnDeviceMismatch(settled.error))) warnE2ee("letting this device in", settled.error)
                return true
            }
            return false
        })
        return () => {
            stop()
            unsubscribe()
        }
    }, [approved, idpUrl, actorUri])

    return { state, entering, newCode: () => resume.current?.() }
}
