import { ArrowRight, Copy } from "lucide-react"

import type { DevicesFromBefore } from "@pinai/domain/usecases/e2ee/devices-from-before.usecase"
import { Button } from "@/presentation/atoms/Button/Button"
import { RecoveryPassphraseDisplay } from "@/presentation/molecules/RecoveryPassphraseDisplay/RecoveryPassphraseDisplay"
import { cn } from "@/presentation/_libs/utils"

import { useNewWordsViewModel } from "./NewWords.viewmodel"

interface NewWordsProps {
    words: string[]
    onContinue: () => void
    /** In a scrolling dialog: Copy and Continue stay in view at its foot. */
    stickyActions?: boolean
}

/**
 * The account's new 24 words once this device started over or replaced them, shown as the first
 * device's are, with the devices they left behind named; Continue goes on.
 */
export function NewWords({ words, onContinue, stickyActions = false }: NewWordsProps) {
    const vm = useNewWordsViewModel(words, onContinue)

    return (
        <section aria-label="Your new passphrase" className="px-[34px] py-[30px] max-[440px]:px-5">
            <p className="fact m-0 text-acc">Your new passphrase</p>
            <p className="m-0 mb-[18px] mt-2.5 text-[14px] leading-[1.6] text-muted-foreground">
                Keep these words somewhere only you reach — paper, a password manager. With them, a device of yours
                brings your history back. Your old words no longer open anything.
            </p>
            <RecoveryPassphraseDisplay words={words} badgeLabel="new" />
            {vm.fromBefore && (
                <p className="m-0 mt-[18px] rounded-[14px] border border-[color-mix(in_oklab,var(--idle)_40%,transparent)] bg-[color-mix(in_oklab,var(--idle)_8%,transparent)] px-3.5 py-3 text-[13px] leading-[1.55] text-foreground">
                    {fromBeforeLine(vm.fromBefore)}
                </p>
            )}
            <div
                className={cn(
                    "mt-5 flex flex-wrap items-center gap-2.5",
                    stickyActions &&
                        "sticky bottom-0 -mx-[34px] -mb-[30px] border-t border-line bg-popover px-[34px] py-4 max-[440px]:-mx-5 max-[440px]:px-5",
                )}
            >
                <Button variant="secondary" size="inline" onPress={vm.onCopy}>
                    <Copy className="h-[15px] w-[15px]" />
                    Copy passphrase
                </Button>
                <span className="flex-1" />
                <Button size="inline" onPress={vm.onContinue}>
                    Continue
                    <ArrowRight className="h-[15px] w-[15px]" />
                </Button>
            </div>
        </section>
    )
}

// A device with the old words shows a banner, and asks once "It was me" is chosen; one that never held them asks by itself.
const ASK = `open Pīna'i on it — choose "It was me" if it shows a banner — then type the code it shows here`
const LOST = "a device you've lost still shows your conversations until you sign it out"

function fromBeforeLine({ cause, labels }: DevicesFromBefore): string {
    const named = labels.join(", ")
    const one = labels.length === 1
    const who =
        cause === "replacement"
            ? one
                ? `Your other device (${named}) needs the new words.`
                : `Your other devices (${named}) need the new words.`
            : one
              ? `Your device from before (${named}) is no longer approved.`
              : `Your devices from before (${named}) are no longer approved.`
    return one
        ? `${who} If you still have it, ${ASK}. If you've lost it, sign it out in Settings → Devices: ${LOST}.`
        : `${who} If you still have one, ${ASK}. If you've lost one, sign it out in Settings → Devices: ${LOST}.`
}
