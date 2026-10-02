import { Button } from "@/presentation/atoms/Button/Button"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { cn } from "@/presentation/_libs/utils"

interface RemoveGroupFromListModalProps {
    /** The group being cleared; the modal is closed while null. */
    groupName: string | null
    isPending?: boolean
    onCancel: () => void
    onConfirm: () => void
}

export function RemoveGroupFromListModal({ groupName, isPending, onCancel, onConfirm }: RemoveGroupFromListModalProps) {
    return (
        <Modal isOpen={groupName !== null} onClose={onCancel} label="Confirm remove group from list">
            <div className={cn(modalSurface, "w-[420px] p-6")}>
                <h3 className="title text-[20px] font-normal text-foreground">Remove from list?</h3>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground">
                    Remove <span className="font-medium text-foreground">{groupName}</span> from your list? Its
                    messages are deleted from this device.
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
