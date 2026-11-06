import type { ReactNode } from "react"

import { Button } from "@/presentation/atoms/Button/Button"
import { RecentSignInModal } from "@/presentation/molecules/RecentSignInModal/RecentSignInModal"

import {
    START_OVER_NOTICES,
    useStartOverPanelViewModel,
    type StartOverPanelInput,
    type StartOverPanelViewModel,
} from "./StartOverPanel.viewmodel"

/**
 * Why this device starts over: everything lost (a new device), a reset the user didn't make ("It
 * wasn't me" on the reset page; `password-changed`, the banner's step after the password), or a
 * change no device of theirs made.
 */
export type StartOverReason = "lost-everything" | "not-me" | "password-changed" | "unknown-change"

const STAYS =
    "Your saved history is erased, and this device won't see your existing conversations unless a device you still have comes back: it will warn you, and can come back with a code typed here. Your account, your friends and new conversations stay."

const WAITS = "Your approved devices, if any, are told first: you finish here once none of them has been used for 7 days."

const COPY: Record<StartOverReason, { eyebrow: string; heading: string; body: string }> = {
    "lost-everything": {
        eyebrow: "Start over",
        heading: "No device left, no words left?",
        body: `This device gets a new passphrase and becomes your reference. ${STAYS}`,
    },
    "not-me": {
        eyebrow: "Start over from here",
        heading: "It wasn't me",
        body: `Then the device that reset your history isn't yours, and it won't be approved. This device gets a new passphrase and becomes your reference instead. ${STAYS}`,
    },
    "password-changed": {
        eyebrow: "Then, start over",
        heading: "Make this device your reference",
        body: `The device that reset your history isn't yours: it won't be approved. This device gets a new passphrase and becomes your reference instead. ${STAYS}`,
    },
    "unknown-change": {
        eyebrow: "Start over from here",
        heading: "Make this device your reference",
        body: `This device gets a new passphrase and becomes your reference, whatever your instance changed. ${STAYS}`,
    },
}

const TOO_MANY = "Three requests to start over were made on this account today. Try again tomorrow."

interface StartOverPanelProps extends StartOverPanelInput {
    reason: StartOverReason
    /** "It wasn't me" after a device of the user's replaced the words: that device, by its label. */
    replacedOn?: string | null
    /** The page's code tab: the better way while the user still has a device approved now. */
    onApproveInstead?: () => void
}

/** The warning, the request it opens and its wait, then "Finish starting over" (`identity-provider/specs/e2ee.md § 6.11`). */
export function StartOverPanel({ reason, replacedOn = null, onApproveInstead, ...input }: StartOverPanelProps) {
    const vm = useStartOverPanelViewModel(input)
    const notMine = reason === "not-me" || reason === "password-changed"
    const setter = replacedOn ?? (reason === "not-me" ? "the device that replaced your words" : "the device that reset your history")
    const copy =
        reason === "not-me" && replacedOn
            ? {
                  ...COPY["not-me"],
                  body: `Then someone else replaced your words on ${replacedOn}: it won't be approved, and once this device has started over, it can sign ${replacedOn} out. This device gets a new passphrase and becomes your reference instead. ${STAYS}`,
              }
            : COPY[reason]
    const note =
        vm.ended === "cancelled"
            ? notMine
                ? `Your request to start over was cancelled. Whoever has ${setter} has your password: change it first, then ask again.`
                : "One of your devices cancelled your request to start over. If you have that device, approve this one with a code from it instead."
            : vm.ended === "superseded"
              ? START_OVER_NOTICES.superseded
              : vm.tooMany
                ? TOO_MANY
                : null
    const instead =
        reason === "not-me"
            ? `If it was you after all, approving this device with a code from ${setter} keeps your history.`
            : "Still have one of your devices? Approving this one with a code from it is quicker, and keeps your history."
    const busy = vm.asking || vm.starting || vm.withdrawing

    return (
        <section aria-label="Start over" className="px-[34px] py-[30px] max-[440px]:px-5">
            {reason === "not-me" && (
                <div className="mb-[26px]">
                    <Heading eyebrow="First, your password" heading="Change your password">
                        Whoever has {setter} has your password too. Change it with a reset link — "Forgot password?" on your
                        instance's sign-in page, or ask its admin for one. That signs every session out, theirs and this one:
                        once you've signed in again, come back here to start over. This device then waits until that device has
                        gone 7 days unused. As long as they can still use it, it never finishes — which is why the password
                        comes first.
                    </Heading>
                </div>
            )}
            {vm.stage === "waiting" ? (
                <>
                    <Heading eyebrow="Start over · asked" heading="Waiting on your other devices" tone="idle">
                        Your other devices have been told. If none of them is used for 7 days, you can finish here on{" "}
                        <span className="font-medium text-foreground">{vm.readyOn}</span>.
                    </Heading>
                    {vm.notYet && <p className="m-0 mt-3 text-[13px] leading-[1.55] text-idle-ink">Not yet: you can finish on {vm.readyOn}.</p>}
                    {onApproveInstead && <ApproveInstead text={instead} onPress={onApproveInstead} isDisabled={busy} />}
                    <Withdraw vm={vm} isDisabled={busy} />
                </>
            ) : vm.stage === "ready" ? (
                <>
                    <Heading eyebrow="Start over · ready" heading="You can finish starting over">
                        {vm.readyAtOnce ? "No approved device of yours to wait for." : "None of your other devices has been used for 7 days."}{" "}
                        Finishing erases your saved history and gives this device new words; your password is asked first.
                    </Heading>
                    <Button variant="destructive-outline" className="mt-[22px]" onPress={vm.onFinish} isDisabled={busy}>
                        {vm.starting ? "Starting over…" : "Finish starting over"}
                    </Button>
                    <Withdraw vm={vm} isDisabled={busy} />
                </>
            ) : vm.stage === "elsewhere" ? (
                <>
                    <Heading eyebrow="Start over" heading="Another device asked first">
                        Another device has already asked to start your history over, and only one request can be open at a
                        time: this one can ask once that one is cancelled or withdrawn. Your approved devices can cancel it.
                    </Heading>
                    {onApproveInstead && <ApproveInstead text={instead} onPress={onApproveInstead} isDisabled={busy} />}
                </>
            ) : (
                <>
                    <Heading eyebrow={copy.eyebrow} heading={copy.heading}>
                        {copy.body} {WAITS}
                    </Heading>
                    {note && <p className="m-0 mt-3 text-[13px] leading-[1.55] text-idle-ink">{note}</p>}
                    <Button
                        variant="destructive-outline"
                        className="mt-[22px]"
                        onPress={vm.onStartOver}
                        isDisabled={!input.ready || vm.stage === "loading" || busy}
                    >
                        {vm.asking ? "Asking your devices…" : vm.starting ? "Starting over…" : "Erase and start over"}
                    </Button>
                </>
            )}
            {/* Mounted throughout so each change is announced; no height while empty. */}
            <p role="status" className="m-0 text-[12.5px] leading-[1.5] text-dnd-ink [&:not(:empty)]:mt-3">
                {vm.error}
            </p>
            <RecentSignInModal
                action={vm.recentSignIn.asking}
                host={vm.recentSignIn.host}
                isLeaving={vm.recentSignIn.isLeaving}
                onCancel={vm.recentSignIn.dismiss}
                onContinue={vm.recentSignIn.signInAgain}
            />
        </section>
    )
}

function Heading({ eyebrow, heading, tone = "dnd", children }: { eyebrow: string; heading: string; tone?: "dnd" | "idle"; children: ReactNode }) {
    return (
        <>
            <p className={tone === "idle" ? "fact m-0 text-idle-ink" : "fact m-0 text-dnd-ink"}>{eyebrow}</p>
            <p className="title m-0 mt-3 text-[26px] leading-[1.15] text-foreground">{heading}</p>
            <p className="m-0 mt-3 text-[14px] leading-[1.6] text-muted-foreground">{children}</p>
        </>
    )
}

function ApproveInstead({ text, onPress, isDisabled }: { text: string; onPress: () => void; isDisabled: boolean }) {
    return (
        <div className="mt-[22px] rounded-[14px] border border-line px-4 py-3.5">
            <p className="m-0 text-[13px] leading-[1.55] text-foreground">{text}</p>
            <Button variant="secondary" size="inline" className="mt-3 py-2 text-[12.5px]" onPress={onPress} isDisabled={isDisabled}>
                Approve with another device instead
            </Button>
        </div>
    )
}

function Withdraw({ vm, isDisabled }: { vm: StartOverPanelViewModel; isDisabled: boolean }) {
    return (
        <Button variant="ghost" className="mt-4 text-[12.5px]" onPress={vm.onWithdraw} isDisabled={isDisabled}>
            {vm.withdrawing ? "Withdrawing…" : "Withdraw the request"}
        </Button>
    )
}
