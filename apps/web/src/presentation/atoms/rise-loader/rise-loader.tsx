import { useLayoutEffect } from "react"
import { Logo } from "@/presentation/atoms/Logo/Logo"
import { carrySplashLoop } from "@/presentation/_libs/splash-screen"
import { cn } from "@/presentation/_libs/utils"

interface RiseLoaderProps {
    title?: string
    /** Mono line under the title, e.g. the instance being reached. Hidden when empty. */
    host?: string
    /** Shown right before a redirect: the next page's splash continues this loop instead of restarting it. */
    carryOver?: boolean
    className?: string
}

// index.html carries static copies for the boot splash; test/rise-loader.spec.ts keeps them identical.
export function RiseLoader({ title = "Waking up the island", host = "", carryOver = false, className }: RiseLoaderProps) {
    useLayoutEffect(() => (carryOver ? carrySplashLoop(title) : undefined), [carryOver, title])

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
