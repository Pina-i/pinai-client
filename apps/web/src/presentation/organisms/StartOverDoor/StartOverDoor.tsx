import { KeyRound, ShieldAlert } from "lucide-react"

import type { PasswordChange } from "@pinai/domain/models/instance-admin"
import { Button } from "@/presentation/atoms/Button/Button"
import { DoorHead } from "@/presentation/molecules/DoorHead/DoorHead"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { cn } from "@/presentation/_libs/utils"

import { useStartOverDoorViewModel, type StartOverDoorViewModel } from "./StartOverDoor.viewmodel"

const TITLES = { asked: "Is this you?", guide: "Approve it with a code", cancelled: "Cancelled." } as const

function passwordAdvice(how: PasswordChange, host: string): string {
    switch (how) {
        case "forgot-password":
            return `Sign out, then choose "Forgot password?" on ${host}'s sign-in page: the reset link signs every device out, theirs too.`
        case "ask-an-admin":
            return `Ask an admin of ${host} for a password reset link: it signs every device out, theirs too.`
        case "where-it-runs":
            return `As an admin of ${host}, you get no reset link: change your password where the instance is run.`
        case "unknown":
            return `Change it with a reset link — "Forgot password?" on ${host}'s sign-in page, or ask its admin for one: it signs every device out, theirs too.`
    }
}

/** While another device asks to start the history over: the approval prompt's look (`DoorHead`). */
export function StartOverDoor() {
    const vm = useStartOverDoorViewModel()
    const stage = vm.stage
    return (
        <Modal
            isOpen={vm.request !== null}
            onClose={stage === "asked" ? vm.onNotNow : vm.onDone}
            isDismissable={!vm.cancelling}
            isKeyboardDismissDisabled={vm.cancelling}
            label={TITLES[stage]}
        >
            <div className={cn(modalSurface, "w-[490px] gap-5 overflow-y-auto px-[30px] pb-[22px] pt-7 max-[520px]:px-5")}>
                <DoorHead eyebrow="Start over request" title={TITLES[stage]} device={vm.device} asked={vm.asked} tone="dnd" />

                {stage === "asked" && <Asked vm={vm} />}
                {stage === "guide" && <Guide vm={vm} />}
                {stage === "cancelled" && <Cancelled vm={vm} />}
            </div>
        </Modal>
    )
}

function Asked({ vm }: { vm: StartOverDoorViewModel }) {
    return (
        <>
            <div className="flex flex-col gap-2.5 text-[13px] leading-[1.55] text-muted-foreground">
                <p className="m-0 text-foreground">Someone asked to start your history over from {vm.device}.</p>
                <p className="m-0">
                    If nobody uses this device or another of your approved devices for 7 days, {vm.device} can erase your
                    history backup and set new words for your account. Until then, you can cancel it from here.
                </p>
            </div>
            <div role="alert">{vm.error && <p className="m-0 text-[12.5px] text-dnd">{vm.error}</p>}</div>
            <div className="flex flex-col gap-2.5">
                <Button variant="destructive" size="inline" onPress={vm.onCancel} isDisabled={vm.cancelling} autoFocus>
                    {vm.cancelling ? "Cancelling…" : "Cancel — it wasn't me"}
                </Button>
                {vm.answersCodes && (
                    <Button variant="secondary" size="inline" onPress={vm.onItsMe} isDisabled={vm.cancelling}>
                        It's me — approve with a code instead
                    </Button>
                )}
                <div className="flex justify-end pt-1">
                    <Button variant="ghost" className="text-[12.5px]" onPress={vm.onNotNow} isDisabled={vm.cancelling}>
                        Not now
                    </Button>
                </div>
            </div>
        </>
    )
}

function Guide({ vm }: { vm: StartOverDoorViewModel }) {
    return (
        <>
            <p className="m-0 flex gap-2.5 text-[13px] leading-[1.55] text-muted-foreground">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-acc" strokeWidth={1.9} aria-hidden />
                <span>
                    On {vm.device}, choose "Approve with another device instead" under its request — or "It was me", if it
                    shows a banner. It shows a 6-digit code: type it here when Pīna'i asks for it. That keeps your history, and
                    ends the request.
                </span>
            </p>
            <div className="flex justify-end pt-1">
                <Button size="inline" variant="secondary" onPress={vm.onDone} autoFocus>
                    OK
                </Button>
            </div>
        </>
    )
}

function Cancelled({ vm }: { vm: StartOverDoorViewModel }) {
    return (
        <>
            <div role="status" className="flex flex-col gap-2.5 text-[13px] leading-[1.55] text-muted-foreground">
                <p className="m-0 flex gap-2.5 text-foreground">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-dnd-ink" strokeWidth={1.9} aria-hidden />
                    <span>
                        This request is cancelled, but {vm.device} can ask again: whoever asked from it has your password. Change it
                        now.
                    </span>
                </p>
                <p className="m-0">{passwordAdvice(vm.passwordChange, vm.host)}</p>
                <p className="m-0">Then sign {vm.device} out in Settings → Devices.</p>
            </div>
            <div className="flex justify-end pt-1">
                <Button size="inline" variant="secondary" onPress={vm.onDone} autoFocus>
                    Done
                </Button>
            </div>
        </>
    )
}
