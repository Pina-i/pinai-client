import { ArrowRight, Copy } from "lucide-react"

import { Button } from "@/presentation/atoms/Button/Button"
import { RecoveryPassphraseDisplay } from "@/presentation/molecules/RecoveryPassphraseDisplay/RecoveryPassphraseDisplay"

import { useNewWordsViewModel } from "./NewWords.viewmodel"

/** The account's new 24 words once this device started over, shown as the first device's are; Continue goes on. */
export function NewWords({ words, onContinue }: { words: string[]; onContinue: () => void }) {
    const vm = useNewWordsViewModel(words, onContinue)

    return (
        <section aria-label="Your new passphrase" className="px-[34px] py-[30px] max-[440px]:px-5">
            <p className="fact m-0 text-acc">Your new passphrase</p>
            <p className="m-0 mb-[18px] mt-2.5 text-[14px] leading-[1.6] text-muted-foreground">
                Keep these words somewhere only you reach — paper, a password manager. With them, a device of yours
                brings your history back. Your old words no longer open anything.
            </p>
            <RecoveryPassphraseDisplay words={words} badgeLabel="new" />
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
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
