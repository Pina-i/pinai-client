import { Dialog, Modal as AriaModal, ModalOverlay } from "react-aria-components"
import type { ReactNode } from "react"
import { cn } from "@/presentation/_libs/utils"

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    children: ReactNode
    /** "centered" (default) renders a centered dialog over a dimmed backdrop.
     *  "fullscreen" fills the entire viewport — use for settings-style overlays. */
    variant?: "centered" | "fullscreen"
    className?: string
    isDismissable?: boolean
}

export function Modal({
    isOpen,
    onClose,
    children,
    variant = "centered",
    className,
    isDismissable = true,
}: ModalProps) {
    const isFullscreen = variant === "fullscreen"

    return (
        <ModalOverlay
            isOpen={isOpen}
            onOpenChange={(open) => !open && onClose()}
            isDismissable={isDismissable}
            className={cn(
                "fixed inset-0 z-[100] flex",
                isFullscreen ? "bg-sidebar/95" : "items-center justify-center bg-foreground/50",
            )}
        >
            <AriaModal
                className={cn(
                    "outline-none",
                    isFullscreen && "flex flex-1",
                    className,
                )}
            >
                <Dialog className={cn("outline-none", isFullscreen && "flex flex-1")}>
                    {children}
                </Dialog>
            </AriaModal>
        </ModalOverlay>
    )
}
