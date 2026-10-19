import { Logo } from "@/presentation/atoms/Logo/Logo"
import { cn } from "@/presentation/_libs/utils"

interface RiseLoaderProps {
    title?: string
    /** Mono line under the title, e.g. the instance being reached. Hidden when empty. */
    host?: string
    className?: string
}

// index.html carries static copies for the boot splash; test/rise-loader.spec.ts keeps them identical.
export function RiseLoader({ title = "Waking up the island", host = "", className }: RiseLoaderProps) {
    return (
        <div role="status" className={cn("pn-rise", className)}>
            <Logo className="pn-rise-mark" />
            <div aria-hidden className="pn-rise-horizon" />
            <div className="pn-rise-caption">
                <p className="pn-rise-title">{title}</p>
                <p className="pn-rise-host">{host}</p>
            </div>
        </div>
    )
}
