import { useEffect, useRef } from "react"

import type { ResetCause } from "@pinai/domain/models/admission"
import { Button } from "@/presentation/atoms/Button/Button"
import { SegmentedTabPanel, SegmentedTabs, type SegmentedTab } from "@/presentation/molecules/SegmentedTabs/SegmentedTabs"
import { ApproveFromAnotherDevice } from "@/presentation/organisms/ApproveFromAnotherDevice/ApproveFromAnotherDevice"
import { NewWords } from "@/presentation/organisms/NewWords/NewWords"
import { StartOverPanel, type StartOverReason } from "@/presentation/organisms/StartOverPanel/StartOverPanel"
import { WordsPanel } from "@/presentation/organisms/WordsPanel/WordsPanel"
import { PassCard, PassShell } from "@/presentation/templates/PassShell/PassShell"

import { ResetNote } from "./ResetNote/ResetNote"
import { UnknownChange } from "./UnknownChange/UnknownChange"
import {
    useRecoveryRestorePageViewModel,
    type RecoveryRestoreViewModel,
    type RestoreTab,
    type RestoreVariant,
} from "./RecoveryRestorePage.viewmodel"

const NEW_DEVICE_TABS: readonly SegmentedTab<RestoreTab>[] = [
    { id: "device", label: "Another device" },
    { id: "words", label: "My 24 words" },
    { id: "start-over", label: "Start over" },
]

const RESET_TABS: readonly SegmentedTab<RestoreTab>[] = [
    { id: "device", label: "That device" },
    { id: "words", label: "Its 24 words" },
    { id: "start-over", label: "Start over" },
]

const RESET_TITLES: Record<ResetCause | "unknown", string> = {
    "newer-generation": "Your history was reset from another device",
    "unknown-change": "Your instance changed your history key",
    unknown: "Your history key changed",
}

/**
 * Where a device that isn't in stays — § 5.2's new-device page, or § 5.4's reset page, both drawn as
 * Pass — until another device approves it, its 24 words are typed, or it starts over; signing out is
 * the only other way off. A device already in comes here only to bring its history.
 */
export function RecoveryRestorePage({ variant = "new-device" }: { variant?: RestoreVariant }) {
    const vm = useRecoveryRestorePageViewModel(variant)
    const reset = variant === "reset"

    if (vm.newWords) {
        return (
            <PassShell instance={vm.instance} title="Your new 24 words" titleFocusKey="new-words">
                <PassCard>
                    <NewWords words={vm.newWords} onContinue={vm.onIn} />
                </PassCard>
            </PassShell>
        )
    }

    const startOver = (reason: StartOverReason) => (
        <StartOverPanel
            reason={reason}
            ready={vm.deviceReady && !vm.approvedHere}
            returnTo={vm.startOverReturn}
            onStartedOver={vm.onStartedOver}
            onWentOtherwise={vm.onStartOverWentOtherwise}
            onRolledBack={vm.onRolledBack}
            onBusy={vm.onStartOverBusy}
            replacedOn={vm.replacedOn}
            refused={reason === "not-me" ? vm.refused : null}
        />
    )
    const tabs = (reset ? RESET_TABS : NEW_DEVICE_TABS).filter((t) => t.id !== "start-over" || vm.offersStartOver)
    const title = reset
        ? vm.replacedOn
            ? `Your words were replaced on ${vm.replacedOn}`
            : RESET_TITLES[vm.resetCause ?? "unknown"]
        : vm.isIn
          ? "Bring your history to this device"
          : "First connection to a new device"

    return (
        <PassShell instance={vm.instance} title={title} footer={<Footer vm={vm} />}>
            {vm.notice && <Notice text={vm.notice} takesFocus />}
            {vm.offersWayIn && vm.shareRefused && (
                <Notice text="Your history couldn't be received from your other device. Type your 24 words to bring it back." />
            )}

            {vm.rolledBack ? (
                <PassCard>
                    <ResetNote eyebrow="What happened" onCheckAgain={vm.onIn}>
                        Your instance went back on your account's history key: it now serves an older one than your
                        devices have seen. No device can start over from it — only your instance can put the key back.
                    </ResetNote>
                </PassCard>
            ) : vm.offersWayIn ? (
                <SegmentedTabs tabs={tabs} selected={vm.tab} onChange={vm.setTab} label="How to let this device in" isDisabled={vm.busy}>
                    <PassCard>
                        {/* Mounted on every tab: an exchange another device answered, and the approval it brings, outlive a look elsewhere. */}
                        <SegmentedTabPanel id="device" keepMounted>
                            <ApproveFromAnotherDevice
                                ready={vm.deviceReady}
                                active={vm.tab === "device"}
                                fallbackLabel={vm.deviceLabel}
                                instruction={
                                    vm.replacedOn
                                        ? `Open Pīna'i on ${vm.replacedOn} and type it when it asks.`
                                        : reset
                                          ? "Open Pīna'i on the device that reset your history and type it when it asks."
                                          : undefined
                                }
                                share={vm.share}
                                onApproved={vm.onApproved}
                                onIn={vm.onIn}
                            />
                        </SegmentedTabPanel>
                        <SegmentedTabPanel id="words">
                            <WordsPanel
                                reset={reset}
                                replacedOn={vm.replacedOn}
                                words={vm.words}
                                setWords={vm.setWords}
                                canRestore={vm.canRestore}
                                restoring={vm.status === "restoring"}
                                onRestore={() => void vm.onRestore()}
                            />
                        </SegmentedTabPanel>
                        {vm.offersStartOver && (
                            <SegmentedTabPanel id="start-over">{startOver(reset ? "not-me" : "lost-everything")}</SegmentedTabPanel>
                        )}
                    </PassCard>
                </SegmentedTabs>
            ) : reset && vm.resetCause === "unknown-change" ? (
                <PassCard>
                    {vm.startOverShown ? (
                        <>
                            {startOver("unknown-change")}
                            <div className="-mt-3 px-[34px] pb-[26px] max-[440px]:px-5">
                                <Button variant="ghost" onPress={() => vm.showStartOver(false)} isDisabled={vm.busy} className="text-[12.5px]">
                                    ← What happened
                                </Button>
                            </div>
                        </>
                    ) : (
                        <UnknownChange onCheckAgain={vm.onIn} onStartOver={() => vm.showStartOver(true)} />
                    )}
                </PassCard>
            ) : (
                <PassCard>
                    <ResetNote eyebrow="Your history key" onCheckAgain={vm.onIn}>
                        Reading what changed on your instance…
                    </ResetNote>
                </PassCard>
            )}

            {vm.status === "error" && vm.error && (
                <p role="alert" className="m-0 max-w-[520px] text-center text-[12.5px] text-dnd-ink">
                    {vm.error}
                </p>
            )}
        </PassShell>
    )
}

function Footer({ vm }: { vm: RecoveryRestoreViewModel }) {
    return (
        <>
            {vm.isIn && (
                <Button variant="ghost" onPress={vm.onIn} isDisabled={vm.busy} className="text-[12.5px] underline-offset-[3px]">
                    Back to Pīna'i
                </Button>
            )}
            <Button variant="ghost" onPress={vm.onSignOut} isDisabled={vm.busy} className="text-[12.5px] underline-offset-[3px]">
                Sign out
            </Button>
        </>
    )
}

// `takesFocus`: it replaces what the user was looking at, so the focus goes to it.
function Notice({ text, takesFocus = false }: { text: string; takesFocus?: boolean }) {
    const line = useRef<HTMLParagraphElement>(null)
    useEffect(() => {
        if (takesFocus) line.current?.focus()
    }, [text, takesFocus])
    return (
        <p ref={line} tabIndex={-1} role="status" className="m-0 max-w-[520px] text-center text-[13px] leading-[1.55] text-idle-ink outline-none">
            {text}
        </p>
    )
}
