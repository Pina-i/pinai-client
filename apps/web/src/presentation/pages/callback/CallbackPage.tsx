import pinaiLogo from "@/assets/pinai-logo-dark.svg"
import { Link } from "@/presentation/atoms/Link/Link"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { ShieldAlert } from "lucide-react"
import { useCallbackPageViewModel } from "./CallbackPage.viewmodel"

export function CallbackPage() {
    const { error } = useCallbackPageViewModel()

    if (error) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
                <PageTransition>
                    <div
                        className="w-full max-w-sm bg-card border border-border p-6 space-y-4 text-center"
                        style={{ boxShadow: "var(--shadow)" }}
                    >
                        <ShieldAlert className="h-10 w-10 text-destructive mx-auto" />
                        <p className="text-lg font-semibold text-foreground">
                            Authentication failed
                        </p>
                        <p className="text-sm text-muted-foreground">{error}</p>
                        <Link href="/">Back to login</Link>
                    </div>
                </PageTransition>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <PageTransition className="flex flex-col items-center space-y-6">
                <img
                    src={pinaiLogo}
                    alt="Pīna'i"
                    className="h-12 animate-pulse"
                />
                <div className="flex items-center gap-3">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:0ms]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:150ms]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:300ms]" />
                </div>
                <p className="text-sm text-muted-foreground">Signing you in…</p>
            </PageTransition>
        </div>
    )
}
