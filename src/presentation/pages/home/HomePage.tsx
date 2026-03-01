import { useHomePageViewModel } from "./HomePage.viewmodel"
import { Button } from "@/presentation/atoms/Button/Button"

export function HomePage() {
    const { user, handleLogout } = useHomePageViewModel()

    if (!user) return null

    const initials = user.preferred_username.slice(0, 2).toUpperCase()

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-sm space-y-6">

                {/* Header */}
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-foreground">Pīna&apos;i</h1>
                    <Button
                        variant="ghost"
                        onPress={handleLogout}
                        className="text-xs"
                    >
                        Sign out
                    </Button>
                </div>

                {/* Profile card */}
                <div
                    className="bg-card border border-border p-6 space-y-4"
                    style={{ boxShadow: "var(--shadow)" }}
                >
                    <div className="flex items-center gap-4">
                        {/* Avatar initials */}
                        <div className="w-12 h-12 bg-primary flex items-center justify-center shrink-0">
                            <span className="text-primary-foreground font-bold text-sm">
                                {initials}
                            </span>
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">
                                {user.preferred_username}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                                {user.email}
                            </p>
                        </div>
                    </div>

                    <div className="border-t border-border pt-4 space-y-2">
                        <Row label="Subject" value={user.sub} />
                    </div>
                </div>

                <p className="text-center text-xs text-muted-foreground">
                    You are authenticated. More features coming soon.
                </p>
            </div>
        </div>
    )
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between gap-4 text-sm">
            <span className="text-muted-foreground shrink-0">{label}</span>
            <span className="text-foreground truncate font-mono text-xs">{value}</span>
        </div>
    )
}
