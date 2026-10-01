import { Button } from "@/presentation/atoms/Button/Button"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { modalSurface } from "@/presentation/molecules/Modal/modal-surface"
import { cn } from "@/presentation/_libs/utils"

interface BlockUserModalProps {
    /** The person being blocked; the modal is closed while null. */
    name: string | null
    isPending?: boolean
    onCancel: () => void
    onConfirm: () => void
}

export function BlockUserModal({ name, isPending, onCancel, onConfirm }: BlockUserModalProps) {
    return (
        <Modal isOpen={name !== null} onClose={onCancel} label="Confirm block">
            <div className={cn(modalSurface, "w-[420px] p-6")}>
                <h3 className="title text-[20px] font-normal text-foreground">Block {name}?</h3>
                <p className="mt-2 text-[13.5px] leading-[1.55] text-muted-foreground">
                    <span className="font-medium text-foreground">{name}</span> won't be told. They won't be able to
                    message you or send you friend requests, and you'll stop being friends. Your conversation history
                    stays, and groups you share don't change.
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
                        Block
                    </Button>
                </div>
            </div>
        </Modal>
    )
}
