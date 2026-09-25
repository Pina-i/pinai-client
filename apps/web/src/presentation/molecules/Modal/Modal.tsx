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
    /** Extra classes for the overlay, e.g. a see-through fullscreen scrim. */
    overlayClassName?: string
    isDismissable?: boolean
    /** Accessible name for the dialog. React Aria's `Dialog` emits a console
     *  warning when neither this nor a `<Heading slot="title">` child is
     *  present, so every Modal consumer should pass one (or render a title
     *  heading inside `children`). Required-by-convention rather than
     *  required-by-type to avoid noisy callsite churn during migration. */
    label?: string
}

export function Modal({
    isOpen,
    onClose,
    children,
    variant = "centered",
    className,
    overlayClassName,
    isDismissable = true,
    label,
}: ModalProps) {
    const isFullscreen = variant === "fullscreen"

    return (
        <ModalOverlay
            isOpen={isOpen}
            onOpenChange={(open) => !open && onClose()}
            isDismissable={isDismissable}
            className={cn(
                "fixed inset-0 z-(--z-overlay) flex",
                isFullscreen
                    ? "bg-background"
                    : "items-center justify-center bg-[color-mix(in_oklab,var(--background)_55%,transparent)] backdrop-blur-[6px] entering:animate-in entering:fade-in-0 entering:duration-200",
                overlayClassName,
            )}
        >
            <AriaModal
                className={cn(
                    "outline-none",
                    isFullscreen && "flex flex-1",
                    className,
                )}
            >
                <Dialog
                    aria-label={label}
                    className={cn("outline-none", isFullscreen && "flex flex-1")}
                >
                    <motion.div
                        initial={isFullscreen ? { opacity: 0, y: 12 } : { opacity: 0, scale: 0.96 }}
                        animate={isFullscreen ? { opacity: 1, y: 0 } : { opacity: 1, scale: 1 }}
                        transition={
                            isFullscreen
                                ? { duration: 0.3, ease: "easeOut" }
                                : { duration: 0.22, ease: [0.16, 1, 0.3, 1] }
                        }
                        className={cn(isFullscreen && "flex flex-1")}
                    >
                        {children}
                    </motion.div>
                </Dialog>
            </AriaModal>
        </ModalOverlay>
    )
}
