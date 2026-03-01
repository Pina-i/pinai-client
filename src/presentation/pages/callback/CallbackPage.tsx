import { useCallbackPageViewModel } from "./CallbackPage.viewmodel"
import { Link } from "@/presentation/atoms/Link/Link"

export function CallbackPage() {
    const { error } = useCallbackPageViewModel()

    if (error) {
        return (
            <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
                <div
                    className="w-full max-w-sm bg-card border border-border p-6 space-y-4 text-center"
                    style={{ boxShadow: "var(--shadow)" }}
                >
                    <p className="text-lg font-semibold text-foreground">
                        Authentication failed
                    </p>
                    <p className="text-sm text-muted-foreground">{error}</p>
                    <Link href="/">Back to login</Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center space-y-3">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-muted-foreground">Signing you in…</p>
            </div>
        </div>
    )
}
