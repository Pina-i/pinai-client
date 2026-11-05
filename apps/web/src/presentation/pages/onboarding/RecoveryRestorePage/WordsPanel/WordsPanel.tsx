import { Button } from "@/presentation/atoms/Button/Button"
import { RecoveryPassphraseInput } from "@/presentation/molecules/RecoveryPassphraseInput/RecoveryPassphraseInput"

interface WordsPanelProps {
    /** On the reset page they are the new words, from the device that reset the history. */
    reset: boolean
    /** The device of the user's that replaced the words, by its label, when it is known. */
    replacedOn?: string | null
    words: string[]
    setWords: (next: string[]) => void
    canRestore: boolean
    restoring: boolean
    onRestore: () => void
}

/** "My 24 words": checked against the account's key before anything is kept, an empty archive or not. */
export function WordsPanel({ reset, replacedOn = null, words, setWords, canRestore, restoring, onRestore }: WordsPanelProps) {
    return (
        <section aria-label={reset ? "Its 24 words" : "My 24 words"} className="px-[34px] py-[30px] max-[440px]:px-5">
            <p className="fact m-0 text-acc">{reset ? "Its new passphrase" : "Your passphrase"}</p>
            <p className="m-0 mb-[18px] mt-2.5 text-[14px] leading-[1.55] text-muted-foreground">
                {replacedOn
                    ? `The new words, from ${replacedOn}: your old ones no longer open your history. Pasting all of them at once works.`
                    : reset
                    ? "The new words, from the device that reset your history: your old ones no longer open it. Pasting all of them at once works."
                    : "The 24 words you wrote down when you set up your account. Pasting all of them at once works."}
            </p>
            <RecoveryPassphraseInput value={words} onChange={setWords} disabled={restoring} />
            <Button className="mt-5" onPress={onRestore} isDisabled={!canRestore || restoring}>
                {restoring ? "Bringing your history…" : "Bring my history →"}
            </Button>
        </section>
    )
}
