import pinaiLogo from "@/assets/pinai-logo-dark.svg"
import { Button } from "@/presentation/atoms/Button/Button"
import { TextField } from "@/presentation/atoms/TextField/TextField"
import { useLandingPageViewModel } from "./LandingPage.viewmodel"

export function LandingPage() {
    const { idpUrl, setIdpUrl, loading, error, handleLogin } = useLandingPageViewModel()

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-sm space-y-8">
                {/* Logo / heading */}
                <div className="flex items-start justify-center space-x-3">
                    <img
                        src={pinaiLogo}
                        alt="Pīna'i logo"
                        className="h-16"
                    />
                    <div>
                        <h1 className="text-5xl font-bold tracking-tight text-foreground">Pīna&apos;i</h1>
                        <p className="text-muted-foreground text-sm">Your identity, your community.</p>
                    </div>
                </div>

                {/* Login card */}
                <div
                    className="bg-card border border-border p-6 space-y-4"
                    style={{ boxShadow: "var(--shadow)" }}
                >
                    <TextField
                        label="Identity provider"
                        type="url"
                        value={idpUrl}
                        onChange={setIdpUrl}
                        placeholder="http://localhost:8080"
                        isDisabled={loading}
                        error={error ?? undefined}
                    />

                    <Button
                        onPress={handleLogin}
                        isDisabled={loading || !idpUrl}
                    >
                        {loading ? "Connecting…" : "Sign in"}
                    </Button>
                </div>

                <p className="text-center text-xs text-muted-foreground">Self-hosted · Federated · Open source</p>
            </div>
        </div>
    )
}
