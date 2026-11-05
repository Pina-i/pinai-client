import { Button } from "@/presentation/atoms/Button/Button"
import { RecentSignInModal } from "@/presentation/molecules/RecentSignInModal/RecentSignInModal"

import { useStartOverPanelViewModel, type StartOverPanelInput } from "./StartOverPanel.viewmodel"

/**
 * Why this device starts over: everything lost (a new device), a reset the user didn't make ("It
 * wasn't me" on the reset page; `password-changed`, the banner's step after the password), or a
 * change no device of theirs made.
 */
export type StartOverReason = "lost-everything" | "not-me" | "password-changed" | "unknown-change"

const STAYS =
    "Your saved history is erased, and this device won't see your existing conversations unless a device you still have comes back: it will warn you, and can come back with a code typed here. Your account, your friends and new conversations stay."

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

interface StartOverPanelProps extends StartOverPanelInput {
    reason: StartOverReason
    /** The device is set up and not approved by a code meanwhile: the flow can run. */
    ready: boolean
    /** "It wasn't me" after a device of the user's replaced the words: that device, by its label. */
    replacedOn?: string | null
}

/** The warning, then "Erase and start over" (`identity-provider/specs/e2ee.md § 6.11`). */
export function StartOverPanel({ reason, ready, replacedOn = null, ...input }: StartOverPanelProps) {
    const vm = useStartOverPanelViewModel(input)
    const copy =
        reason === "not-me" && replacedOn
            ? {
                  ...COPY["not-me"],
                  body: `Then someone else replaced your words on ${replacedOn}: it won't be approved, and you can revoke it from another device. This device gets a new passphrase and becomes your reference instead. ${STAYS}`,
              }
            : COPY[reason]

    return (
        <section aria-label="Start over" className="px-[34px] py-[30px] max-[440px]:px-5">
            <p className="fact m-0 text-dnd-ink">{copy.eyebrow}</p>
            <p className="title m-0 mt-3 text-[26px] leading-[1.15] text-foreground">{copy.heading}</p>
            <p className="m-0 mt-3 text-[14px] leading-[1.6] text-muted-foreground">{copy.body}</p>
            <Button variant="destructive-outline" className="mt-[22px]" onPress={vm.onStartOver} isDisabled={!ready || vm.starting}>
                {vm.starting ? "Starting over…" : "Erase and start over"}
            </Button>
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
