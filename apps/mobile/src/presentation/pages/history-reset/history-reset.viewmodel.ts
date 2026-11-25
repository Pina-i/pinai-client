import type { RestoreTab } from "@pinai/domain/models/restore-page"
import { router, useLocalSearchParams } from "expo-router"
import { useCallback, useState } from "react"
import { useHistoryReset } from "@/presentation/_libs/history-reset"
import { useAwaitedShare } from "@/presentation/hooks/use-awaited-share"
import { GATE_ROUTES } from "@/presentation/hooks/use-onboarding-gate"
import { useOwnStartOver } from "@/presentation/hooks/use-own-start-over"
import type { ResetWay } from "@/presentation/organisms/history-reset-banner/history-reset-banner.viewmodel"
import { START_OVER_NOTICES, type StartOverNotice } from "@/presentation/organisms/start-over-way/start-over-wording"

const WAYS: readonly ResetWay[] = ["it-was-me", "it-wasnt-me", "start-over"]

/**
 * The banner's sheet: back in with the code or the new words ("It was me"), or a start over refusing the setter ("It
 * wasn't me", the password first) or whatever the instance changed. Each way's end checks again, and the sheet goes.
 */
export function useHistoryResetSheet() {
    const { way: asked } = useLocalSearchParams<{ way?: string }>()
    const way: ResetWay = WAYS.find((w) => w === asked) ?? "it-was-me"
    const { reset, recheck } = useHistoryReset()
    const [tab, setTab] = useState<RestoreTab>("device")
    const [busy, setBusy] = useState(false)
    const [approvedHere, setApprovedHere] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const [rolledBack, setRolledBack] = useState(false)

    const done = useCallback(() => {
        void recheck().finally(() => {
            if (router.canGoBack()) router.back()
        })
    }, [recheck])

    // Approved here by a code: the share is likelier now; kept, the device is back in.
    const awaited = useAwaitedShare(way === "it-was-me" && approvedHere, done)
    const { again } = awaited
    const own = useOwnStartOver(way !== "it-was-me")

    return {
        way,
        setter: reset?.setter ?? null,
        tab,
        setTab,
        busy,
        notice,
        rolledBack,
        share: awaited.share,
        onApproved: useCallback(() => {
            setApprovedHere(true)
            again()
        }, [again]),
        onTyping: useCallback((typing: boolean) => setBusy(typing), []),
        setUp: useCallback(() => null, []),
        done,
        own,
        returnTo: useCallback(() => `/history-reset?way=${way}`, [way]),
        onStartOverBusy: useCallback((working: boolean) => {
            if (working) setNotice(null)
            setBusy(working)
        }, []),
        // The setup page shows a start over's new words.
        onStartedOver: useCallback(() => router.replace(GATE_ROUTES.setup), []),
        onWentOtherwise: useCallback(
            (how: StartOverNotice) => {
                setNotice(START_OVER_NOTICES[how])
                void recheck()
            },
            [recheck]
        ),
        onRolledBack: useCallback(() => setRolledBack(true), []),
        close: () => router.back(),
    }
}
