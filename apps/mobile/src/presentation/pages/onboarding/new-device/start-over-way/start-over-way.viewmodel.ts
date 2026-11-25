import { clockLeadOf } from "@pinai/domain/models/auth"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import {
    endedNote,
    type FinishHold,
    heldBack,
    readyAtOnce,
    sightStartOver,
    type StartOverSighting,
    startOverStage,
} from "@pinai/domain/models/start-over"
import { StartOverFlow, type StartOverFlowResult, type StartOverStep } from "@pinai/domain/usecases/e2ee/start-over-flow.usecase"
import { askToStartOverUseCase, endStartOverUseCase } from "@pinai/domain/usecases/e2ee/start-over-request.usecase"
import { startOverUseCase } from "@pinai/domain/usecases/e2ee/start-over.usecase"
import { useEffect, useMemo, useRef, useState } from "react"
import { getE2eePort, getHistoryArchivePort, getKeySharePort, getPendingKeyLock, getSessionPort, getStartOverPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { accessTokenArrivedAt } from "@/presentation/_libs/session"
import { warnE2ee } from "@/presentation/_libs/warn-e2ee"
import type { OwnStartOver } from "@/presentation/hooks/use-own-start-over"
import { useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"
import { momentLabel, type StartOverNotice, startOverRefusalLine, TOO_MANY } from "./start-over-wording"

export interface StartOverWayInput {
    own: OwnStartOver
    /** The device is set up and not approved by a code meanwhile: it may ask. */
    ready: boolean
    /** Where a sign-in asked for the password comes back to: this way, on its page. */
    returnTo: () => string
    /** "It wasn't me": the device the key names, kept apart from the devices from before. */
    refused?: DeviceId | null
    onStartedOver: () => void
    onWentOtherwise: (how: StartOverNotice) => void
    onRolledBack: () => void
    onBusy: (busy: boolean) => void
}

/**
 * A device not approved asks first and finishes once its request matured (the domain's `StartOverFlow`): the password
 * is asked before anything is minted, and a press the IdP's last "not yet" answered mints nothing.
 */
export function useStartOverWay({ own, ready, returnTo, refused = null, onStartedOver, onWentOtherwise, onRolledBack, onBusy }: StartOverWayInput) {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [step, setStep] = useState<StartOverStep | null>(null)
    const [tooMany, setTooMany] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [hold, setHold] = useState<FinishHold | null>(null)
    const [holdTick, setHoldTick] = useState(0)
    const recentSignIn = useRecentSignIn(returnTo)
    const { state, reread, setRead } = own
    const now = Math.max(own.now, holdTick)
    const request = state && "request" in state ? state.request : null
    const held = request !== null && heldBack(request, hold, now)

    useEffect(() => {
        if (!hold || !held) return
        const timer = setTimeout(() => setHoldTick(Date.now()), Math.max(0, hold.until - Date.now()) + 1_000)
        return () => clearTimeout(timer)
    }, [hold, held])

    const flow = useMemo(
        () =>
            new StartOverFlow(
                {
                    session: () => {
                        const accessToken = useAppStore.getState().accessToken
                        return idpUrl && accessToken && actorUri ? { idpUrl, accessToken, actorUri } : null
                    },
                    ask: (session) =>
                        askToStartOverUseCase({ e2eePort: getE2eePort(), sessionPort: getSessionPort(), startOverPort: getStartOverPort() })(
                            session.idpUrl,
                            session.accessToken,
                            session.actorUri
                        ),
                    startOver: (session, refusedDevice) =>
                        startOverUseCase({
                            ...admissionDeps(),
                            sessionPort: getSessionPort(),
                            historyArchivePort: getHistoryArchivePort(),
                            keySharePort: getKeySharePort(),
                            report: warnE2ee,
                            pendingKeyLock: getPendingKeyLock(),
                        })({ ...session, tokenArrivedAt: accessTokenArrivedAt(session.accessToken), refused: refusedDevice }),
                    end: (session, requestId) =>
                        endStartOverUseCase({ startOverPort: getStartOverPort() })(session.idpUrl, session.accessToken, requestId),
                    newWordsToShow: () => getE2eePort().newWordsToShow(),
                    clockLead: (session) => clockLeadOf(session.accessToken, accessTokenArrivedAt(session.accessToken)),
                    signInAgainOnDeviceMismatch,
                    warn: warnE2ee,
                },
                {
                    known: (read) => setRead(() => read),
                    held: (next) => {
                        setHold(next)
                        setRead((read) =>
                            read?.kind === "request" && read.request.id === next.requestId
                                ? { ...read, request: { ...read.request, readyAt: next.readyAt } }
                                : read
                        )
                    },
                    reread,
                    step: setStep,
                }
            ),
        [idpUrl, actorUri, reread, setRead]
    )

    const settle = (end: StartOverFlowResult) => {
        switch (end.kind) {
            case "started-over":
                onStartedOver()
                return
            case "needs-recent-sign-in":
                recentSignIn.ask("start over")
                return
            case "went-otherwise":
                onWentOtherwise(end.how)
                return
            case "rolled-back":
                onRolledBack()
                return
            case "too-many":
                setTooMany(true)
                return
            case "failed":
                setError(
                    end.during === "finish"
                        ? "Couldn't start over: your instance didn't answer. Try again."
                        : startOverRefusalLine(end.error, end.during)
                )
                return
        }
    }

    const run = (work: () => Promise<StartOverFlowResult>) => {
        if (flow.busy || !useAppStore.getState().accessToken) return
        onBusy(true)
        setError(null)
        void work()
            .then(settle)
            .catch((failure: unknown) => warnE2ee("starting over", failure))
            .finally(() => onBusy(false))
    }

    // Seen open here, then approved or superseded: the page says so and checks.
    const [seen, setSeen] = useState<StartOverSighting>({ open: null, told: null })
    const sighted = sightStartOver(seen, state)
    if (sighted.seen !== seen) setSeen(sighted.seen)
    const tellKind = sighted.tell
    const tell = useRef(onWentOtherwise)
    useEffect(() => {
        tell.current = onWentOtherwise
    })
    useEffect(() => {
        if (tellKind) tell.current(tellKind)
    }, [tellKind, seen.told])

    const stage = startOverStage({ mayAsk: ready, state, readFailed: own.failed, held })

    return {
        stage,
        readyOn: stage === "waiting" && request ? momentLabel(held && hold ? hold.readyAt : request.readyAt) : null,
        notYet: held,
        readyAtOnce: readyAtOnce(state),
        ended: endedNote(state, tellKind),
        tooMany: tooMany ? TOO_MANY : null,
        asking: step === "asking",
        starting: step === "starting",
        withdrawing: step === "withdrawing",
        error,
        recentSignIn,
        startOver: () => {
            setTooMany(false)
            run(() => flow.startOver(refused))
        },
        finish: () => {
            if (!held) run(() => flow.finish(request?.id ?? null, refused))
        },
        withdraw: () => {
            if (request) run(() => flow.withdraw(request.id))
        },
    }
}
