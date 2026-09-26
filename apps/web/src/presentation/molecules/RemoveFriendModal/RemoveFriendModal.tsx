import { Button } from "@/presentation/atoms/Button/Button"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { cn } from "@/presentation/_libs/utils"

interface RemoveFriendModalProps {
    /** The friend being removed; the modal is closed while null. */
    friendName: string | null
    isPending?: boolean
    onCancel: () => void
    onConfirm: () => void
}

export function RemoveFriendModal({ friendName, isPending, onCancel, onConfirm }: RemoveFriendModalProps) {
    return (
        <Modal isOpen={friendName !== null} onClose={onCancel} label="Confirm remove friend">
            <div className={cn(modalSurface, "w-[420px] p-6")}>
                <h3 className="title text-[20px] font-normal text-foreground">Remove friend?</h3>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground">
                    Remove <span className="font-medium text-foreground">{friendName}</span> from your friends?
                    They won't be notified, and your conversation history stays.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                    <Button variant="secondary" size="inline" onPress={onCancel}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        size="inline"
                        onPress={onConfirm}
                        isDisabled={isPending}
                        className="font-semibold"
                    >
                        Remove
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
