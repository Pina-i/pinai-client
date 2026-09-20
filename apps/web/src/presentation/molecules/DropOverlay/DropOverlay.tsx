import { Upload } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { cn } from "@/presentation/_libs/utils"

interface DropOverlayProps {
    /** True when files are being dragged over the conversation area. */
    isVisible: boolean
}

/**
 * Full-area drop indicator. Pointer-events-none so the actual drop hits the
 * underlying handler that toggled this on; this is purely a visual hint.
 */
export function DropOverlay({ isVisible }: DropOverlayProps) {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center p-8"
                    style={{ background: "oklch(0.10 0.005 60 / 0.55)", backdropFilter: "blur(2px)" }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                        className={cn(
                            "flex h-full w-full flex-col items-center justify-center gap-3",
                            "rounded-[var(--radius-lg)] border border-dashed border-chat",
                            "text-foreground",
                        )}
                        style={{
                            background: "color-mix(in oklab, var(--chat) 8%, transparent)",
                            borderWidth: 1.5,
                        }}
                    >
                        <span
                            className={cn(
                                "flex h-14 w-14 items-center justify-center rounded-full text-chat",
                                "border border-chat",
                            )}
                            style={{ borderWidth: 1.5 }}
                        >
                            <Upload className="h-6 w-6" />
                        </span>
                        <span className="title text-[22px] font-normal tracking-[-0.01em]">
                            Drop files to attach
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
                            up to 5 files · max 50 MB each
                        </span>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
