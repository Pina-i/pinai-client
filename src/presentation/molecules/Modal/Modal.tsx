import { Dialog, Modal as AriaModal, ModalOverlay } from "react-aria-components"
import { motion } from "motion/react"
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
                    <motion.div
                        initial={isFullscreen ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                        className={cn(isFullscreen && "flex flex-1")}
                    >
                        {children}
                    </motion.div>
                </Dialog>
            </AriaModal>
        </ModalOverlay>
    )
}
