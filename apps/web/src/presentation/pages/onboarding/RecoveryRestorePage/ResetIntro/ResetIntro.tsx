import type { ResetCause } from "@pinai/domain/models/admission"
import { Button } from "@/presentation/atoms/Button/Button"

const TITLES: Record<ResetCause | "unknown", string> = {
    "newer-generation": "Your history was reset from another device",
    "unknown-change": "Your history was reset for an unknown change",
    unknown: "Your history key changed",
}

export function ResetIntro({ cause }: { cause: ResetCause | null }) {
    return (
        <>
            <h1 className="title m-0 mb-3.5 text-[38px] font-normal leading-[1.08] tracking-[-0.02em] text-foreground">
                {TITLES[cause ?? "unknown"]}
                <em className="italic text-acc">.</em>
            </h1>
            {cause === "newer-generation" && (
                <>
                    <p className="m-0 mb-6 max-w-[520px] text-[14px] leading-[1.6] text-muted-foreground">
                        Another device set a new history passphrase, so this one no longer reads your history. Let it
                        back in from that device, or type its new 24 words here.
                    </p>
                    <p className="eye mb-2">That device</p>
                </>
            )}
            {cause === "unknown-change" && <UnknownChange />}
        </>
    )
}

// No device holds a key the instance put in, and the old words are refused: the code and the words are left out.
function UnknownChange() {
    return (
        <div className="max-w-[540px] text-[14px] leading-[1.6] text-muted-foreground">
            <p className="m-0 mb-3.5">
                Your instance changed your history key without a new passphrase being set: none of your devices did
                this. Until it's settled, this device trusts nothing new and stays here.
            </p>
            <p className="eye mb-2">What can bring it back</p>
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
                <li>Your instance puts the key back: "Check again" lets this device in.</li>
                <li>Starting over from here, in a later release.</li>
                <li>Or sign out.</li>
            </ul>
        </div>
    )
}

export function StartOverHere() {
    return (
        <div className="mt-7 max-w-[540px] rounded-[14px] border border-dashed border-line2 px-3.5 py-3">
            <Button variant="destructive" size="inline" isDisabled>
                It wasn't me — start over from here
            </Button>
            <p className="m-0 mt-2 text-[12px] leading-[1.5] text-muted-foreground">
                This comes with the start over, in a later release. Until then, sign out if the change wasn't yours.
            </p>
        </div>
    )
}
