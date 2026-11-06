import { useLocation, useRouter } from "@tanstack/react-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { KeptWordsCause, KeptWordsReset } from "@pinai/domain/models/admission"
import type { DeviceId } from "@pinai/domain/models/e2ee"
import type { AwaitedShareState } from "@pinai/domain/usecases/e2ee/accept-history-share.usecase"
import { dropSearchParam } from "@/presentation/_libs/search-param"
import { userAgentLabel } from "@/presentation/_libs/user-agent-label"
import { useAwaitedShare } from "@/presentation/hooks/use-awaited-share"
import { useOwnStartOver, type OwnStartOver } from "@/presentation/hooks/use-own-start-over"
import { useTypedWords, type TypedWords } from "@/presentation/hooks/use-typed-words"
import { START_OVER_NOTICES, type StartOverNotice } from "@/presentation/organisms/StartOverPanel/StartOverPanel.viewmodel"
import { useHistoryReset, type RecheckOutcome } from "@/presentation/providers/HistoryResetProvider/HistoryReset.context"

/** `way-back`: "It was me", the code or the new words; `start-over`: "It wasn't me", or a start over after an unknown change. */
export type BannerModal = "way-back" | "start-over"

export type WayBackTab = "device" | "words"

/** A sign-in asked for before a start over comes back with this, to open it again. */
export const RETURN_PARAM = "reset"

export function askedBackIn(searchStr: string): boolean {
    return new URLSearchParams(searchStr).get(RETURN_PARAM) === "start-over"
}

const CHECK_NOTES: Record<RecheckOutcome, string> = {
    checked: "Nothing has changed yet: your instance hasn't put your history key back.",
    offline: "Couldn't reach your instance. Try again in a moment.",
    failed: "Couldn't reach your instance. Try again in a moment.",
}

export interface HistoryResetBannerViewModel {
    /** Why the bar shows; `null` once the device is in otherwise — a modal open stays until closed. */
    cause: KeptWordsCause | null
    /** The cause the open modal was opened for: it keeps its words when the bar goes. */
    modalCause: KeptWordsCause | null
    modal: BannerModal | null
    open: (modal: BannerModal) => void
    close: () => void
    /** A flow runs in the open modal — typed words, a start over, an exchange another device answered: it stays. */
    busy: boolean
    checking: boolean
    /** After "Check again": what it found, while the cause it checked stands. */
    checkNote: string | null
    onCheckAgain: () => void

    tab: WayBackTab
    setTab: (tab: WayBackTab) => void
    /** This device's label until the instance's list names it. */
    deviceLabel: string
    share: AwaitedShareState | null
    onApproved: () => void
    onIn: () => void
    onWorking: (working: boolean) => void
    typed: TypedWords

    /** "It wasn't me": the device the key names, kept apart from the devices from before. */
    refused: DeviceId | null
    /** This device's own start over request, read while the start over modal is open. */
    ownStartOver: OwnStartOver
    startOverReturn: () => string
    onStartOverBusy: (busy: boolean) => void
    newWords: string[] | null
    onStartedOver: (words: string[]) => void
    onStartOverWentOtherwise: (how: StartOverNotice) => void
    rolledBack: boolean
    onRolledBack: () => void
    /** What went otherwise than asked: a line over the modal's content. */
    notice: string | null
    onNewWordsContinue: () => void
}

/** Each way's end checks again; `onHeld` keeps the holder mounted while a modal is open, the cause gone or not. */
export function useHistoryResetBannerViewModel(onHeld: (held: boolean) => void): HistoryResetBannerViewModel {
    const { reset, recheck } = useHistoryReset()
    const cause = reset?.cause ?? null
    const router = useRouter()
    const location = useLocation()
    const askedBack = askedBackIn(location.searchStr)

    // Back from the password asked again before a start over: the same modal, where the user confirms once more.
    const [opened, setOpened] = useState<{ modal: BannerModal; reset: KeptWordsReset } | null>(() =>
        askedBack && reset ? { modal: "start-over", reset } : null,
    )
    const [tab, setTab] = useState<WayBackTab>("device")
    const [startingOver, setStartingOver] = useState(false)
    const [typing, setTyping] = useState(false)
    const [answering, setAnswering] = useState(false)
    const [newWords, setNewWords] = useState<string[] | null>(null)
    const [rolledBack, setRolledBack] = useState(false)
    const [notice, setNotice] = useState<string | null>(null)
    const [checking, setChecking] = useState(false)
    const [checked, setChecked] = useState<{ cause: KeptWordsCause | null; outcome: RecheckOutcome } | null>(null)
    const approved = useRef(false)
    const typingRef = useRef(false)

    useEffect(() => {
        if (askedBack) dropSearchParam(router, RETURN_PARAM)
    }, [askedBack, router])

    const held = opened !== null
    useEffect(() => onHeld(held), [held, onHeld])

    const onTyping = useCallback((busy: boolean) => {
        typingRef.current = busy
        setTyping(busy)
    }, [])
    const onFailed = useCallback((message: string) => setNotice(message), [])

    const close = useCallback(() => {
        setOpened(null)
        void recheck()
    }, [recheck])
    const typed = useTypedWords({ onBusy: onTyping, onKept: close, onFailed })
    const { clear } = typed
    const closeAndClear = useCallback(() => {
        clear()
        close()
    }, [clear, close])

    const open = useCallback(
        (modal: BannerModal) => {
            if (!reset) return
            approved.current = false
            clear()
            setTab("device")
            setNotice(null)
            setRolledBack(false)
            setNewWords(null)
            setChecked(null)
            setOpened({ modal, reset })
        },
        [reset, clear],
    )

    const onCheckAgain = useCallback(() => {
        setChecking(true)
        setChecked(null)
        void recheck().then((outcome) => {
            setChecking(false)
            setChecked({ cause, outcome })
        })
    }, [recheck, cause])

    const wayBack = opened?.modal === "way-back"
    // Approved here, the code's section goes on itself once the restore settles; typed words go their own way.
    const awaited = useAwaitedShare(wayBack, () => {
        if (!approved.current && !typingRef.current) closeAndClear()
    })
    const { again } = awaited
    const onApproved = useCallback(() => {
        approved.current = true
        again()
    }, [again])

    const startOverReturn = useCallback(() => {
        const search = new URLSearchParams(location.searchStr)
        search.set(RETURN_PARAM, "start-over")
        return `${location.pathname}?${search.toString()}`
    }, [location])

    const onStartOverBusy = useCallback((busy: boolean) => {
        if (busy) setNotice(null)
        setStartingOver(busy)
    }, [])
    const onStartOverWentOtherwise = useCallback(
        (how: StartOverNotice) => {
            setNotice(START_OVER_NOTICES[how])
            void recheck()
        },
        [recheck],
    )
    // The device holds its own words now: the bar goes, the words stay until the user goes past them.
    const onStartedOver = useCallback(
        (words: string[]) => {
            setNewWords(words)
            void recheck()
        },
        [recheck],
    )
    const onRolledBack = useCallback(() => setRolledBack(true), [])
    const onNewWordsContinue = useCallback(() => {
        setNewWords(null)
        close()
    }, [close])

    const ownStartOver = useOwnStartOver(opened?.modal === "start-over")
    const deviceLabel = useMemo(() => userAgentLabel(), [])
    const openedFor = opened?.reset ?? null

    return {
        cause,
        modalCause: openedFor?.cause ?? null,
        modal: opened?.modal ?? null,
        open,
        close: closeAndClear,
        busy: startingOver || typing || answering,
        checking,
        checkNote: cause && checked?.cause === cause ? CHECK_NOTES[checked.outcome] : null,
        onCheckAgain,
        tab,
        setTab,
        deviceLabel,
        share: awaited.share,
        onApproved,
        onIn: closeAndClear,
        onWorking: setAnswering,
        typed,
        refused: openedFor?.cause === "reset-by-unapproved" ? openedFor.setter : null,
        ownStartOver,
        startOverReturn,
        onStartOverBusy,
        newWords,
        onStartedOver,
        onStartOverWentOtherwise,
        rolledBack,
        onRolledBack,
        notice,
        onNewWordsContinue,
    }
}
