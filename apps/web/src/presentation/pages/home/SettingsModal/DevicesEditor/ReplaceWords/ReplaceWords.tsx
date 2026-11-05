import { Button } from "@/presentation/atoms/Button/Button"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { NewWords } from "@/presentation/organisms/NewWords/NewWords"
import { cn } from "@/presentation/_libs/utils"

import type { ReplaceWordsViewModel } from "./ReplaceWords.viewmodel"

const WHAT_HAPPENS = [
    "24 new words replace yours.",
    "Your history backup is first brought onto this device, then erased and saved again from it under the new words, in the background — keep Pīna'i open until it's done; it carries on at the next start.",
    "Your devices this one approved with a code get the new words by themselves; the others ask with a code or type the new words.",
    "A device you revoked can't use the old words any more.",
]

/** The confirmation of "Replace my words", then the new words over Settings until Continue. */
export function ReplaceWords({ vm }: { vm: ReplaceWordsViewModel }) {
    return (
        <>
            <Modal
                isOpen={vm.confirming}
                onClose={vm.cancel}
                isDismissable={!vm.replacing}
                isKeyboardDismissDisabled={vm.replacing}
                label="Replace your 24 words?"
            >
                <div className={cn(modalSurface, "w-[460px] overflow-y-auto p-6 max-[440px]:p-5")}>
                    <p className="fact m-0 text-dnd-ink">Replace my words</p>
                    <h3 className="title m-0 mt-2 text-[22px] font-normal leading-[1.2] text-foreground">Replace your 24 words?</h3>
                    <p className="m-0 mt-2 text-[13.5px] leading-[1.55] text-muted-foreground">
                        For when someone saw them, or a device you revoked held them.
                    </p>
                    <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
                        {WHAT_HAPPENS.map((line) => (
                            <li key={line} className="flex gap-2.5 text-[13.5px] leading-[1.5] text-foreground">
                                <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-dnd" />
                                <span>{line}</span>
                            </li>
                        ))}
                    </ul>
                    {/* Mounted throughout so each change is announced; no height while empty. */}
                    <p role="status" className="m-0 text-[12.5px] leading-[1.5] text-dnd-ink [&:not(:empty)]:mt-4">
                        {vm.error}
                    </p>
                    <div className="mt-6 flex flex-wrap justify-end gap-2">
                        <Button variant="secondary" size="inline" onPress={vm.cancel} isDisabled={vm.replacing}>
                            Cancel
                        </Button>
                        <Button variant="destructive-outline" size="inline" onPress={vm.confirm} isDisabled={vm.replacing}>
                            {vm.replacing ? "Replacing…" : "Replace my words"}
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                isOpen={vm.newWords !== null}
                onClose={() => undefined}
                isDismissable={false}
                isKeyboardDismissDisabled
                label="Your new 24 words"
            >
                <div className={cn(modalSurface, "w-[560px] overflow-y-auto")}>
                    {vm.newWords && <NewWords words={vm.newWords} onContinue={vm.onContinue} stickyActions />}
                </div>
            </Modal>
        </>
    )
}
