import { Button } from "@/presentation/atoms/Button/Button"

interface UnknownChangeProps {
    onCheckAgain: () => void
    onStartOver: () => void
}

// No device holds a key the instance put in, and the old words are refused: no code, no words.
export function UnknownChange({ onCheckAgain, onStartOver }: UnknownChangeProps) {
    return (
        <section aria-label="What happened" className="px-[34px] py-[30px] max-[440px]:px-5">
            <p className="fact m-0 text-idle-ink">What happened</p>
            <p className="m-0 mt-2.5 text-[14px] leading-[1.6] text-muted-foreground">
                None of your devices set a new passphrase: your instance replaced your history key, went back to an older
                one, or swapped how it approves devices. Until it's settled, this device trusts nothing new and stays here.
            </p>
            <ul className="m-0 mt-3.5 flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-[1.55] text-muted-foreground">
                <li>Your instance puts the key back: "Check again" lets this device in.</li>
                <li>Or start over from here: this device becomes your reference.</li>
            </ul>
            <div className="mt-[22px] flex flex-wrap items-center gap-2.5">
                <Button variant="secondary" size="inline" onPress={onCheckAgain}>
                    Check again
                </Button>
                <Button variant="destructive-outline" size="inline" onPress={onStartOver}>
                    Start over from here
                </Button>
            </div>
        </section>
    )
}
