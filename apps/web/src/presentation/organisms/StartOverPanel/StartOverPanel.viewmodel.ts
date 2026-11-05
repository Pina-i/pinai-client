import { useCallback, useRef, useState } from "react"

import type { DeviceId } from "@pinai/domain/models/e2ee"
import { startOverUseCase } from "@pinai/domain/usecases/e2ee/start-over.usecase"
import { getE2eePort, getHistoryArchivePort, getKeySharePort, getSessionPort } from "@/ioc"
import { admissionDeps } from "@/presentation/_libs/admission-deps"
import { signInAgainOnDeviceMismatch } from "@/presentation/_libs/device-mismatch"
import { warnE2ee } from "@/presentation/_libs/key-share-deps"
import { pendingKeyLock } from "@/presentation/_libs/pending-key-lock"
import { accessTokenArrivedAt } from "@/presentation/_libs/session-renewal"
import { type RecentSignIn, useRecentSignIn } from "@/presentation/hooks/use-recent-sign-in"
import { useAppStore } from "@/store/store"

export interface StartOverPanelInput {
    /** Where a sign-in asked for the password comes back to: where the panel is shown. */
    returnTo: () => string
    /** "It wasn't me": the device the key names, kept apart from the devices from before. */
    refused?: DeviceId | null
    /** The device holds the new generation: its words to show. */
    onStartedOver: (words: string[]) => void
    /** Another device's generation landed first (`conflict`), or right after this one's (`key-changed`). */
    onWentOtherwise: (how: "conflict" | "key-changed") => void
    /** The instance went back on the account's key: no start over can move forward from it. */
    onRolledBack: () => void
    /** The flow runs: what holds the panel holds still meanwhile. */
    onBusy: (busy: boolean) => void
}

/** What a holder says when the start over went otherwise. */
export const START_OVER_NOTICES = {
    conflict: "Another of your devices set a new passphrase at the same moment, so this one didn't start over.",
    "key-changed": "This device started over, then another of your devices set a newer passphrase: its words are the ones now.",
} as const

export interface StartOverPanelViewModel {
    starting: boolean
    error: string | null
    recentSignIn: RecentSignIn
    onStartOver: () => void
}

/**
 * "Erase and start over": a password typed too long ago is asked again first — the IdP's page, back
 * to this tab, where the user confirms once more; nothing is minted before. Then the domain's flow,
 * whose new words the page shows. A `401` asking for it anyway takes the same way. A failure that
 * left the start over done shows its words all the same.
 */
export function useStartOverPanelViewModel({
    returnTo,
    refused = null,
    onStartedOver,
    onWentOtherwise,
    onRolledBack,
    onBusy,
}: StartOverPanelInput): StartOverPanelViewModel {
    const idpUrl = useAppStore((s) => s.idpUrl)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    const [starting, setStarting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const running = useRef(false)
    const recentSignIn = useRecentSignIn(returnTo)
    const { ask } = recentSignIn

    const onStartOver = useCallback(() => {
        const accessToken = useAppStore.getState().accessToken
        if (!idpUrl || !accessToken || !actorUri || running.current) return
        running.current = true
        setStarting(true)
        setError(null)
        onBusy(true)
        void (async () => {
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
                running.current = false
                setStarting(false)
                onBusy(false)
            }
        })()
    }, [idpUrl, actorUri, refused, onStartedOver, onWentOtherwise, onRolledBack, onBusy, ask])

    return { starting, error, recentSignIn, onStartOver }
}
