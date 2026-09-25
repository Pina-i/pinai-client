import { AnimatePresence, motion } from "motion/react"
import type { ReactNode } from "react"

interface AnimatedContentProps {
    children: ReactNode
    contentKey?: string | number
    className?: string
    /** `wait` swaps one after the other; `crossfade` mounts the next at once, over the leaving one. */
    mode?: "wait" | "crossfade"
}

export function AnimatedContent({ children, contentKey, className, mode = "wait" }: AnimatedContentProps) {
    return (
        <AnimatePresence mode={mode === "crossfade" ? "popLayout" : "wait"}>
            <motion.div
                key={contentKey}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className={className}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    )
}
