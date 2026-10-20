import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { Logo } from "@/presentation/atoms/Logo/Logo"
import { AuthTopRule } from "@/presentation/templates/AuthShell/auth-top-rule"

interface HandoffScreenProps {
    /** The instance's name, as its NodeInfo gives it. */
    name: string
    /** Where the browser is about to go, once known. */
    endpoint: string | null
    /** The bar reached the instance. */
    onBarDone: () => void
}

/** Between Continue and the instance's own sign-in page: the browser is leaving this app. */
export function HandoffScreen({ name, endpoint, onBarDone }: HandoffScreenProps) {
    return (
        <div className="relative flex min-h-screen overflow-hidden bg-background">
            <Backdrop />
            <AuthTopRule />
            <div className="relative z-[2] flex flex-1 flex-col items-center justify-center gap-[26px] text-center">
                <div className="flex items-center gap-3.5">
                    <Logo className="h-[38px] w-[51.68px] text-foreground" />
                    <div className="relative h-0.5 w-[180px] overflow-hidden rounded-[2px] bg-line2">
                        <i className="pn-hand-grow absolute inset-0 origin-left bg-acc" onAnimationEnd={onBarDone} />
                    </div>
                    <span className="title inline-flex size-[46px] shrink-0 items-center justify-center rounded-[16px] border border-line2 bg-surf2 text-[17px] font-semibold text-foreground">
                        {Array.from(name)[0]?.toUpperCase()}
                    </span>
                </div>
                <div className="pn-auth-rise [animation-delay:80ms]">
                    <p className="eye">— Leaving {window.location.host}</p>
                    <h2 className="title mt-2 text-[34px] font-normal tracking-[-0.015em] text-foreground">
                        Taking you to {name}
                    </h2>
                    <p className="fact fact-plain mt-3 min-h-3">{endpoint}</p>
                </div>
            </div>
        </div>
    )
}
