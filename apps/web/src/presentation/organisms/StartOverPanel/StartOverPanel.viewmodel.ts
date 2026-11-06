import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useEffect, useRef, useState } from "react"

import { clockLeadOf } from "@pinai/domain/models/auth"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import { heldBack, holdAfterRefusal, startOverReady, type FinishHold, type StartOverRead } from "@pinai/domain/models/start-over"
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

type Stage = "loading" | "choice" | "waiting" | "ready" | "elsewhere"

export interface StartOverPanelViewModel {
    /** `choice`: the warning and "Erase and start over"; the others follow this device's request. */
    stage: Stage
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
    const running = useRef(false)
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
            running.current = busy
            onBusy(busy)
        },
        [onBusy],
    )

    const finish = useCallback(
        async (requestId: string | null) => {
            const accessToken = useAppStore.getState().accessToken
            if (!idpUrl || !accessToken || !actorUri) return
            setStarting(true)
            try {
                const outcome = await startOverUseCase({
                    ...admissionDeps(),
                    sessionPort: getSessionPort(),
                    historyArchivePort: getHistoryArchivePort(),
                    keySharePort: getKeySharePort(),
                    report: warnE2ee,
                    pendingKeyLock: pendingKeyLock(actorUri),
                })({ idpUrl, accessToken, actorUri, tokenArrivedAt: accessTokenArrivedAt(accessToken), refused })
                switch (outcome.kind) {
                    case "started-over":
                        onStartedOver(outcome.words)
                        break
                    case "recent-sign-in":
                        ask("start over")
                        break
                    case "conflict":
                    case "key-changed":
                        onWentOtherwise(outcome.kind)
                        break
                    case "rolled-back":
                        onRolledBack()
                        break
                    case "not-ready": {
                        const { readyAt } = outcome
                        if (readyAt !== null && requestId) {
                            const lead = clockLeadOf(accessToken, accessTokenArrivedAt(accessToken))
                            setHold(holdAfterRefusal(requestId, readyAt, Date.now(), lead))
                            queryClient.setQueryData<StartOverRead>(ownStartOverQueryKey(idpUrl), (read) =>
                                read?.kind === "request" && read.request.id === requestId ? { ...read, request: { ...read.request, readyAt } } : read,
                            )
                        }
                        await refetch()
                        break
                    }
                    case "request-required":
                        await refetch()
                        break
                }
            } catch (e) {
                if (await signInAgainOnDeviceMismatch(e)) return
                warnE2ee("starting over", e)
                const unseen = await getE2eePort()
                    .newWordsToShow()
                    .catch(() => null)
                if (unseen) onStartedOver(unseen.words)
                else setError("Couldn't start over: your instance didn't answer. Try again.")
            } finally {
                setStarting(false)
            }
        },
        [idpUrl, actorUri, refused, onStartedOver, onWentOtherwise, onRolledBack, ask, refetch, queryClient],
    )

    const onFinish = useCallback(() => {
        if (running.current || held) return
        holdStill(true)
        setError(null)
        void finish(request?.id ?? null).finally(() => holdStill(false))
    }, [finish, holdStill, held, request])

    const onStartOver = useCallback(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !actorUri || running.current) return
        holdStill(true)
        setAsking(true)
        setTooMany(false)
        setError(null)
        void (async () => {
            try {
                const asked = await askToStartOverUseCase({
                    e2eePort: getE2eePort(),
                    sessionPort: getSessionPort(),
                    startOverPort: getStartOverPort(),
                })(idpUrl, accessToken, actorUri)
                const key = ownStartOverQueryKey(idpUrl)
                switch (asked.kind) {
                    case "asked": {
                        const read: StartOverRead = { kind: "request", request: asked.request }
                        queryClient.setQueryData(key, read)
                        setAsking(false)
                        if (startOverReady(asked.request, Date.now())) await finish(asked.request.id)
                        else void refetch()
                        break
                    }
                    case "not-needed":
                        setAsking(false)
                        await finish(null)
                        break
                    case "elsewhere": {
                        const read: StartOverRead = { kind: "elsewhere" }
                        queryClient.setQueryData(key, read)
                        break
                    }
                    case "too-many":
                        setTooMany(true)
                        break
                }
            } catch (e) {
                if (await signInAgainOnDeviceMismatch(e)) return
                warnE2ee("asking to start over", e)
                setError(startOverRefusalLine(e, "ask"))
            } finally {
                setAsking(false)
                holdStill(false)
            }
        })()
    }, [idpUrl, actorUri, queryClient, finish, refetch, holdStill])

    const requestId = request?.id ?? null
    const onWithdraw = useCallback(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !requestId || running.current) return
        holdStill(true)
        setWithdrawing(true)
        setError(null)
        void endStartOverUseCase({ startOverPort: getStartOverPort() })(idpUrl, accessToken, requestId)
            .then(() => refetch())
            .catch((e: unknown) => {
                warnE2ee("withdrawing the start over request", e)
                setError(startOverRefusalLine(e, "withdraw"))
            })
            .finally(() => {
                setWithdrawing(false)
                holdStill(false)
            })
    }, [idpUrl, requestId, refetch, holdStill])

    // Seen open here, then approved or superseded: the holder says so and checks. After a reload, the gate already decided.
    const [seen, setSeen] = useState<{ open: string | null; told: string | null }>({ open: null, told: null })
    if ((state?.kind === "waiting" || state?.kind === "ready") && seen.open !== state.request.id) setSeen({ ...seen, open: state.request.id })
    const endedSeen = (state?.kind === "approved" || state?.kind === "superseded") && seen.open === state.request.id ? state : null
    if (endedSeen && seen.told !== endedSeen.request.id) setSeen({ ...seen, told: endedSeen.request.id })
    const tellKind = endedSeen && seen.told === endedSeen.request.id ? endedSeen.kind : null
    const tell = useRef(onWentOtherwise)
    useEffect(() => {
        tell.current = onWentOtherwise
    }, [onWentOtherwise])
    useEffect(() => {
        if (tellKind) tell.current(tellKind)
    }, [tellKind, seen.told])

    const stage: Stage = !ready
        ? "choice"
        : state === null
          ? own.failed
              ? "choice"
              : "loading"
          : held
            ? "waiting"
            : state.kind === "waiting" || state.kind === "ready" || state.kind === "elsewhere"
              ? state.kind
              : "choice"

    return {
        stage,
        readyOn: stage === "waiting" && request ? momentLabel(held && hold ? hold.readyAt : request.readyAt) : null,
        notYet: held,
        readyAtOnce: state?.kind === "ready" && state.request.readyAt <= state.request.createdAt,
        // A superseded request the holder was told of is said there.
        ended: state?.kind === "cancelled" ? "cancelled" : state?.kind === "superseded" && tellKind === null ? "superseded" : null,
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
