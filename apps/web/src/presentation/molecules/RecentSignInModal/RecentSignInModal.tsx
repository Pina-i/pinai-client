import { Button } from "@/presentation/atoms/Button/Button"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { cn } from "@/presentation/_libs/utils"

interface RecentSignInModalProps {
    /** What the password is asked again for, as "revoke a device"; the modal is closed while null. */
    action: string | null
    /** The instance whose login page it is. */
    host: string
    isLeaving?: boolean
    onCancel: () => void
    onContinue: () => void
}

export function RecentSignInModal({ action, host, isLeaving, onCancel, onContinue }: RecentSignInModalProps) {
    return (
        <Modal isOpen={action !== null} onClose={onCancel} label="Type your password again">
            <div className={cn(modalSurface, "w-[420px] p-6")}>
                <h3 className="title text-[20px] font-normal text-foreground">Type your password again</h3>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground">
                    To {action}, sign in again on <span className="font-medium text-foreground">{host}</span>.
                    You'll come back right here.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="secondary" size="inline" onPress={onCancel}>
                        Cancel
                    </Button>
                    <Button size="inline" onPress={onContinue} isDisabled={isLeaving} className="font-semibold">
                        {isLeaving ? "Taking you there…" : "Continue"}
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
