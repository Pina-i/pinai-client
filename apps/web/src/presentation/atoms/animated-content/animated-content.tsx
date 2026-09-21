import { AnimatePresence, motion } from "motion/react"
import type { ReactNode } from "react"

interface AnimatedContentProps {
    children: ReactNode
    contentKey?: string | number
    className?: string
}

export function AnimatedContent({ children, contentKey, className }: AnimatedContentProps) {
    return (
        <AnimatePresence mode="wait">
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
