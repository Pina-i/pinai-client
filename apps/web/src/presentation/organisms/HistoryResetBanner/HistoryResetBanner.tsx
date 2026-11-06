import { useLocation } from "@tanstack/react-router"
import { ShieldAlert } from "lucide-react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import type { KeptWordsCause } from "@pinai/domain/models/admission"
import { Button } from "@/presentation/atoms/Button/Button"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { SegmentedTabPanel, SegmentedTabs, type SegmentedTab } from "@/presentation/molecules/SegmentedTabs/SegmentedTabs"
import { ApproveFromAnotherDevice } from "@/presentation/organisms/ApproveFromAnotherDevice/ApproveFromAnotherDevice"
import { NewWords } from "@/presentation/organisms/NewWords/NewWords"
import { StartOverPanel } from "@/presentation/organisms/StartOverPanel/StartOverPanel"
import { WordsPanel } from "@/presentation/organisms/WordsPanel/WordsPanel"
import { useHistoryReset } from "@/presentation/providers/HistoryResetProvider/HistoryReset.context"
import { cn } from "@/presentation/_libs/utils"

import {
    askedBackIn,
    useHistoryResetBannerViewModel,
    type HistoryResetBannerViewModel,
    type WayBackTab,
} from "./HistoryResetBanner.viewmodel"

const WHAT_HAPPENED: Record<KeptWordsCause, string> = {
    "reset-by-unapproved":
        "Your history was reset from a device this one doesn't know. Nothing is saved to your backup from here until this is settled.",
    "unknown-change":
        "Your instance changed your history key in a way none of your devices made. Nothing is saved to your backup until it puts it back.",
}

const WAY_BACK_TABS: readonly SegmentedTab<WayBackTab>[] = [
    { id: "device", label: "That device" },
    { id: "words", label: "Its 24 words" },
]

/**
 * Above the app's shell, on a device in by the words it kept over a reset it didn't make or vouch
 * for: what happened, and the ways back. It can't be dismissed; it goes once the gate lets the
 * device in otherwise, a modal open staying until done.
 */
export function HistoryResetBanner() {
    const { reset } = useHistoryReset()
    const cause = reset?.cause ?? null
    const askedBack = useLocation({ select: (l) => askedBackIn(l.searchStr) })
    const [held, setHeld] = useState(false)
    // Shown from the first paint, it is part of the page; one that comes later is told.
    const [initial] = useState(cause)
    useFocusAfterBar(cause, held)

    return (
        <>
            <p className="sr-only" role="status">
                {cause && cause !== initial ? WHAT_HAPPENED[cause] : ""}
            </p>
            {(cause || askedBack || held) && <Banner onHeld={setHeld} />}
        </>
    )
}

// The bar's buttons go with it: the focus would fall to the page's body.
function useFocusAfterBar(cause: KeptWordsCause | null, held: boolean) {
    const shown = useRef(cause !== null || held)
    useEffect(() => {
        const was = shown.current
        shown.current = cause !== null || held
        if (!was || shown.current) return
        // After the modal's own focus restore, which finds its trigger gone.
        const later = setTimeout(() => {
            if (document.activeElement === null || document.activeElement === document.body) document.getElementById("app-main")?.focus()
        })
        return () => clearTimeout(later)
    }, [cause, held])
}

function Banner({ onHeld }: { onHeld: (held: boolean) => void }) {
    const vm = useHistoryResetBannerViewModel(onHeld)
    return (
        <>
            {vm.cause && <Bar vm={vm} cause={vm.cause} />}
            <WayBack vm={vm} />
            <StartOver vm={vm} />
        </>
    )
}

function Bar({ vm, cause }: { vm: HistoryResetBannerViewModel; cause: KeptWordsCause }) {
    const button = "py-2 text-[12.5px] @max-[520px]:flex-1"
    return (
        <div className="@container relative z-[2] mx-3 mt-3">
            <section
                aria-label="Your history backup"
                className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-[14px] border border-[color-mix(in_oklab,var(--idle)_45%,transparent)] bg-[color-mix(in_oklab,var(--idle)_10%,var(--background))] px-4 py-3 @max-[520px]:flex-col @max-[520px]:items-stretch"
            >
                <div className="flex min-w-0 flex-1 basis-[300px] items-start gap-3 @max-[520px]:basis-auto">
                    <ShieldAlert className="mt-px h-4 w-4 shrink-0 text-idle-ink" strokeWidth={1.9} aria-hidden />
                    <div className="min-w-0">
                        <p className="m-0 text-[13px] leading-[1.5] text-foreground">{WHAT_HAPPENED[cause]}</p>
                        {/* Mounted throughout so each change is announced; no height while empty. */}
                        <p role="status" className="m-0 text-[12px] leading-[1.5] text-muted-foreground [&:not(:empty)]:mt-1">
                            {vm.checkNote}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {cause === "reset-by-unapproved" ? (
                        <>
                            <Button variant="secondary" size="inline" className={button} onPress={() => vm.open("way-back")}>
                                It was me
                            </Button>
                            <Button variant="destructive-outline" size="inline" className={button} onPress={() => vm.open("start-over")}>
                                It wasn't me
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="secondary" size="inline" className={button} onPress={vm.onCheckAgain} isDisabled={vm.checking}>
                                {vm.checking ? "Checking…" : "Check again"}
                            </Button>
                            <Button variant="destructive-outline" size="inline" className={button} onPress={() => vm.open("start-over")}>
                                Start over from here
                            </Button>
                        </>
                    )}
                </div>
            </section>
        </div>
    )
}

// The same title size as `StartOverPanel`'s heading: the steps read as one hierarchy.
function Heading({ eyebrow, title, tone = "acc", children }: { eyebrow: string; title: string; tone?: "acc" | "dnd"; children: ReactNode }) {
    return (
        <div className="px-[34px] pt-[30px] max-[440px]:px-5 max-[440px]:pt-6">
            <p className={cn("fact m-0", tone === "dnd" ? "text-dnd-ink" : "text-acc")}>{eyebrow}</p>
            <h2 className="title m-0 mt-3 text-[26px] font-normal leading-[1.15] text-foreground">{title}</h2>
            <p className="m-0 mt-3 text-[14px] leading-[1.6] text-muted-foreground">{children}</p>
        </div>
    )
}

function Notice({ text }: { text: string | null }) {
    return (
        <p role="status" className="m-0 px-[34px] text-[13px] leading-[1.55] text-idle-ink max-[440px]:px-5 [&:not(:empty)]:mt-3">
            {text}
        </p>
    )
}

function Footer({ vm, label = "Not now" }: { vm: HistoryResetBannerViewModel; label?: string }) {
    return (
        <div className="flex justify-end border-t border-line px-[34px] py-3.5 max-[440px]:px-5">
            <Button variant="ghost" onPress={vm.close} isDisabled={vm.busy} className="text-[12.5px]">
                {label}
            </Button>
        </div>
    )
}

/** "It was me": the reset page's two ways back — the code typed on the device that reset the history, or its new words. */
function WayBack({ vm }: { vm: HistoryResetBannerViewModel }) {
    return (
        <Modal
            isOpen={vm.modal === "way-back"}
            onClose={vm.close}
            isDismissable={!vm.busy}
            isKeyboardDismissDisabled={vm.busy}
            label="Let this device back in"
        >
            <div className={cn(modalSurface, "w-[580px] overflow-y-auto")}>
                <Heading eyebrow="It was me" title="Let this device back in">
                    Approve it from the device you started over on, or type the new words from it. Then it saves your
                    history again.
                </Heading>
                <Notice text={vm.notice} />
                <SegmentedTabs
                    tabs={WAY_BACK_TABS}
                    selected={vm.tab}
                    onChange={vm.setTab}
                    label="How to let this device back in"
                    isDisabled={vm.busy}
                    className="mt-[22px] gap-[18px]"
                >
                    <div className="w-full border-t border-line">
                        {/* Mounted on every tab: an exchange another device answered outlives a look at the words. */}
                        <SegmentedTabPanel id="device" keepMounted>
                            <ApproveFromAnotherDevice
                                ready
                                active={vm.tab === "device"}
                                fallbackLabel={vm.deviceLabel}
                                instruction="Open Pīna'i on the device that reset your history and type it when it asks."
                                share={vm.share}
                                onApproved={vm.onApproved}
                                onIn={vm.onIn}
                                onWorking={vm.onWorking}
                            />
                        </SegmentedTabPanel>
                        <SegmentedTabPanel id="words">
                            <WordsPanel
                                reset
                                words={vm.typed.words}
                                setWords={vm.typed.setWords}
                                canRestore={vm.typed.canRestore}
                                restoring={vm.typed.restoring}
                                onRestore={() => void vm.typed.onRestore()}
                            />
                        </SegmentedTabPanel>
                    </div>
                </SegmentedTabs>
                <Footer vm={vm} />
            </div>
        </Modal>
    )
}

/** "It wasn't me" — the password first, then a start over here —, or the start over after an unknown change. */
function StartOver({ vm }: { vm: HistoryResetBannerViewModel }) {
    const notMe = vm.modalCause === "reset-by-unapproved"
    return (
        <Modal
            isOpen={vm.modal === "start-over"}
            onClose={vm.close}
            isDismissable={!vm.busy && !vm.newWords}
            isKeyboardDismissDisabled={vm.busy || !!vm.newWords}
            label={vm.newWords ? "Your new 24 words" : notMe ? "It wasn't me" : "Start over from here"}
        >
            <div className={cn(modalSurface, "w-[580px] overflow-y-auto")}>
                {vm.newWords ? (
                    <NewWords words={vm.newWords} onContinue={vm.onNewWordsContinue} stickyActions />
                ) : vm.rolledBack ? (
                    <>
                        <Heading eyebrow="What happened" title="Only your instance can put it back">
                            Your instance went back on your account's history key: it now serves an older one than your
                            devices have seen. No device can start over from it.
                        </Heading>
                        <div className="h-[26px]" />
                        <Footer vm={vm} label="Close" />
                    </>
                ) : (
                    <>
                        {notMe && (
                            <Heading eyebrow="First, your password" title="Change your password" tone="dnd">
                                Someone else has it. Change it with a reset link — "Forgot password?" on your instance's
                                sign-in page, or ask its admin for one. That signs every session out, theirs and this one:
                                once you've signed in again, choose "It wasn't me" on this banner once more. This device
                                then waits like any other: it can finish starting over once the device that reset your
                                history has gone 7 days unused. As long as they can still use it, it never finishes — which
                                is why the password comes first.
                            </Heading>
                        )}
                        <Notice text={vm.notice} />
                        <StartOverPanel
                            reason={notMe ? "password-changed" : "unknown-change"}
                            ready
                            own={vm.ownStartOver}
                            refused={vm.refused}
                            returnTo={vm.startOverReturn}
                            onStartedOver={vm.onStartedOver}
                            onWentOtherwise={vm.onStartOverWentOtherwise}
                            onRolledBack={vm.onRolledBack}
                            onBusy={vm.onStartOverBusy}
                        />
                        <Footer vm={vm} />
                    </>
                )}
            </div>
        </Modal>
    )
}
