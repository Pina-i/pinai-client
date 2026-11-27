import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { clockLeadOf } from "@pinai/domain/models/auth"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import {
    endedNote,
    heldBack,
    readyAtOnce,
    sightStartOver,
    startOverStage,
    type FinishHold,
    type StartOverRead,
    type StartOverSighting,
    type StartOverStage,
} from "@pinai/domain/models/start-over"
import { StartOverFlow, type StartOverFlowResult } from "@pinai/domain/usecases/e2ee/start-over-flow.usecase"
import { askToStartOverUseCase, endStartOverUseCase } from "@pinai/domain/usecases/e2ee/start-over-request.usecase"
import { startOverUseCase } from "@pinai/domain/usecases/e2ee/start-over.usecase"
import { getE2eePort, getHistoryArchivePort, getKeySharePort, getSessionPort, getStartOverPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { momentLabel } from "@/presentation/_libs/day-label"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { pendingKeyLock } from "@/presentation/_libs/pending-key-lock"
import { accessTokenArrivedAt } from "@/presentation/_libs/session-renewal"
import { startOverRefusalLine } from "@/presentation/_libs/start-over-wording"
import { ownStartOverQueryKey, type OwnStartOver } from "@/presentation/hooks/use-own-start-over"
import { type RecentSignIn, useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

/** What went otherwise than asked, for the page holding the panel to say and check again. */
export type StartOverNotice = "conflict" | "key-changed" | "approved" | "superseded"

export interface StartOverPanelInput {
    /** This device's request, read by the holder — the page also opens on its tab. */
    own: OwnStartOver
    /** The device is set up and not approved by a code meanwhile: it may ask. */
    ready: boolean
    /** Where a sign-in asked for the password comes back to: where the panel is shown. */
    returnTo: () => string
    /** "It wasn't me": the device the key names, kept apart from the devices from before. */
    refused?: DeviceId | null
    /** The device holds the new generation: its words to show. */
    onStartedOver: (words: string[]) => void
    /**
     * Another device's generation landed first (`conflict`), or right after this one's
     * (`key-changed`); or, while it waited, another device approved this one (`approved`) or set
     * new words (`superseded`).
     */
    onWentOtherwise: (how: StartOverNotice) => void
    /** The instance went back on the account's key: no start over can move forward from it. */
    onRolledBack: () => void
    /** The flow runs: what holds the panel holds still meanwhile. */
    onBusy: (busy: boolean) => void
}

/** What a holder says when the start over went otherwise. */
export const START_OVER_NOTICES: Record<StartOverNotice, string> = {
    conflict: "Another of your devices set a new passphrase at the same moment, so this one didn't start over.",
    "key-changed": "This device started over, then another of your devices set a newer passphrase: its words are the ones now.",
    approved: "Another of your devices approved this one, so it doesn't need to start over.",
    superseded: "One of your approved devices set new words, which ended your request to start over.",
}

export interface StartOverPanelViewModel {
    /** `choice`: the warning and "Erase and start over"; the others follow this device's request. */
    stage: StartOverStage
    /** While it waits: the day and hour it may finish, as the reader writes them. */
    readyOn: string | null
    /** The IdP said "not yet" to a finish this device's clock thought due. */
    notYet: boolean
    /** Matured as it opened: no approved device to wait for. */
    readyAtOnce: boolean
    /** How this device's last request ended, when that is worth saying; `null` otherwise. */
    ended: "cancelled" | "superseded" | null
    tooMany: boolean
    asking: boolean
    starting: boolean
    withdrawing: boolean
    error: string | null
    recentSignIn: RecentSignIn
    /** "Erase and start over": asks first; finishes at once when there is nothing to wait for. */
    onStartOver: () => void
    /** "Finish starting over", once the request matured. */
    onFinish: () => void
    onWithdraw: () => void
}

/**
 * A device not approved asks first and finishes once its request matured
 * (`identity-provider/specs/e2ee.md § 3.12`). The password is asked before anything is minted, and
 * a press the IdP's last "not yet" already answered mints nothing.
 */
export function useStartOverPanelViewModel({
    own,
    ready,
    returnTo,
    refused = null,
    onStartedOver,
    onWentOtherwise,
    onRolledBack,
    onBusy,
}: StartOverPanelInput): StartOverPanelViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const queryClient = useQueryClient()
    const [asking, setAsking] = useState(false)
    const [starting, setStarting] = useState(false)
    const [withdrawing, setWithdrawing] = useState(false)
    const [tooMany, setTooMany] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [hold, setHold] = useState<FinishHold | null>(null)
    const [holdTick, setHoldTick] = useState(0)
    const recentSignIn = useRecentSignIn(returnTo)
    const { ask } = recentSignIn
    const { state, refetch } = own
    const now = Math.max(own.now, holdTick)
    const request = state && "request" in state ? state.request : null
    const held = request !== null && heldBack(request, hold, now)

    useEffect(() => {
        if (!hold || !held) return
        const timer = setTimeout(() => setHoldTick(Date.now()), Math.max(0, hold.until - Date.now()) + 1_000)
        return () => clearTimeout(timer)
    }, [hold, held])

    const holdStill = useCallback(
        (busy: boolean) => {
            onBusy(busy)
        },
        [onBusy],
    )

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
                            session.actorUri,
                        ),
                    startOver: (session, refusedDevice) =>
                        startOverUseCase({
                            ...admissionDeps(),
                            sessionPort: getSessionPort(),
                            historyArchivePort: getHistoryArchivePort(),
                            keySharePort: getKeySharePort(),
                            report: warnE2ee,
                            pendingKeyLock: pendingKeyLock(session.actorUri),
                        })({ ...session, tokenArrivedAt: accessTokenArrivedAt(session.accessToken), refused: refusedDevice }),
                    end: (session, requestId) =>
                        endStartOverUseCase({ startOverPort: getStartOverPort() })(session.idpUrl, session.accessToken, requestId),
                    newWordsToShow: () => getE2eePort().newWordsToShow(),
                    clockLead: (session) => clockLeadOf(session.accessToken, accessTokenArrivedAt(session.accessToken)),
                    signInAgainOnDeviceMismatch,
                    warn: warnE2ee,
                },
                {
                    known: (read) => {
                        if (idpUrl) queryClient.setQueryData(ownStartOverQueryKey(idpUrl), read)
                    },
                    held: (next) => {
                        setHold(next)
                        if (idpUrl) {
                            queryClient.setQueryData<StartOverRead>(ownStartOverQueryKey(idpUrl), (read) =>
                                read?.kind === "request" && read.request.id === next.requestId
                                    ? { ...read, request: { ...read.request, readyAt: next.readyAt } }
                                    : read,
                            )
                        }
                    },
                    reread: () => refetch(),
                    step: (step) => {
                        setAsking(step === "asking")
                        setStarting(step === "starting")
                        setWithdrawing(step === "withdrawing")
                    },
                },
            ),
        [idpUrl, actorUri, queryClient, refetch],
    )

    const settle = useCallback(
        (end: StartOverFlowResult) => {
            switch (end.kind) {
                case "started-over":
                    onStartedOver(end.words)
                    return
                case "needs-recent-sign-in":
                    ask("start over")
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
                            : startOverRefusalLine(end.error, end.during),
                    )
                    return
            }
        },
        [onStartedOver, ask, onWentOtherwise, onRolledBack],
    )

    // A holder's own callback throwing: warned of, never left unhandled.
    const settleFailed = useCallback((error: unknown) => warnE2ee("starting over", error), [])

    const signedInNow = useCallback(() => !!(idpUrl && actorUri && useAppStore.getState().accessToken), [idpUrl, actorUri])

    const onFinish = useCallback(() => {
        if (flow.busy || held || !signedInNow()) return
        holdStill(true)
        setError(null)
        void flow
            .finish(request?.id ?? null, refused)
            .then(settle)
            .catch(settleFailed)
            .finally(() => holdStill(false))
    }, [flow, held, signedInNow, request, refused, settle, settleFailed, holdStill])

    const onStartOver = useCallback(() => {
        if (flow.busy || !signedInNow()) return
        holdStill(true)
        setTooMany(false)
        setError(null)
        void flow
            .startOver(refused)
            .then(settle)
            .catch(settleFailed)
            .finally(() => holdStill(false))
    }, [flow, signedInNow, refused, settle, settleFailed, holdStill])

    const requestId = request?.id ?? null
    const onWithdraw = useCallback(() => {
        if (!requestId || flow.busy || !signedInNow()) return
        holdStill(true)
        setError(null)
        void flow
            .withdraw(requestId)
            .then(settle)
            .catch(settleFailed)
            .finally(() => holdStill(false))
    }, [flow, requestId, signedInNow, settle, settleFailed, holdStill])

    // Seen open here, then approved or superseded: the holder says so and checks. After a reload, the gate already decided.
    const [seen, setSeen] = useState<StartOverSighting>({ open: null, told: null })
    const sighted = sightStartOver(seen, state)
    if (sighted.seen !== seen) setSeen(sighted.seen)
    const tellKind = sighted.tell
    const tell = useRef(onWentOtherwise)
    useEffect(() => {
        tell.current = onWentOtherwise
    }, [onWentOtherwise])
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
        tooMany,
        asking,
        starting,
        withdrawing,
        error,
        recentSignIn,
        onStartOver,
        onFinish,
        onWithdraw,
    }
}
