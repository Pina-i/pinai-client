import { motion } from "motion/react"
import { Logo } from "@/presentation/atoms/Logo/Logo"

interface AuthLoaderProps {
    /** Mono microcopy shown below the pulse, e.g. `Connecting to idp.alice.com`. */
    caption?: string
}

/**
 * Editorial loader used while the auth flow is in flight — typically right
 * before an OIDC redirect to the IdP. Pulses the brand mark with the same
 * cadence the design canvas uses for the voice ring, so the waiting state
 * still feels like a Pīna'i surface rather than a generic spinner.
 */
export function AuthLoader({ caption = "Connecting…" }: AuthLoaderProps) {
    return (
        <div className="flex flex-col items-center justify-center gap-5 py-12">
            <motion.div
                animate={{ scale: [1, 1.08, 1], opacity: [0.95, 0.45, 0.95] }}
                transition={{ duration: 1.6, ease: "easeInOut", repeat: Infinity }}
            >
                <Logo className="h-12 w-12 text-foreground" />
            </motion.div>
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {caption}
            </p>
        </div>
    )
}
