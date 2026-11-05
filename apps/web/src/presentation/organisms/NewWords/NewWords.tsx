import { ArrowRight, Copy } from "lucide-react"

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

/** The account's new 24 words once this device started over, shown as the first device's are; Continue goes on. */
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
