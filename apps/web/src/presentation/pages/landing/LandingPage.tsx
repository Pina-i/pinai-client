import { Button } from "@/presentation/atoms/Button/Button"
import { TextField } from "@/presentation/atoms/TextField/TextField"
import { AnimatedContent } from "@/presentation/atoms/animated-content/animated-content"
import { AuthLoader } from "@/presentation/atoms/AuthLoader/AuthLoader"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"
import { useLandingPageViewModel } from "./LandingPage.viewmodel"

export function LandingPage() {
    const { idpUrl, setIdpUrl, view, loading, error, handleLogin } = useLandingPageViewModel()

    return (
        <AuthShell>
            <AnimatedContent contentKey={view}>
                {view === "connecting" ? (
                    <AuthLoader caption={`Connecting to ${prettyHost(idpUrl)}…`} />
                ) : (
                    <>
                        <div className="mb-7">
                            <p className="mono-eyebrow">— Welcome</p>
                            <h2 className="title mt-2 text-[32px] font-normal leading-tight tracking-[-0.015em] text-foreground">
                                Pick your home
                            </h2>
                            <p className="mt-3 text-sm leading-[1.55] text-muted-foreground">
                                Pīna'i is federated. Tell us where your identity lives and
                                we'll take you there.
                            </p>
                        </div>

                        <TextField
                            label="Identity provider"
                            type="url"
                            value={idpUrl}
                            onChange={setIdpUrl}
                            placeholder="http://localhost:8080"
                            isDisabled={loading}
                            error={error ?? undefined}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && idpUrl && !loading) handleLogin()
                            }}
                        />

                        <Button
                            variant="primary"
                            onPress={handleLogin}
                            isDisabled={loading || !idpUrl}
                            className="mt-5"
                        >
                            Continue →
                        </Button>

                        <div className="mt-6 flex items-center gap-3 text-muted-foreground">
                            <div className="h-px flex-1 bg-border" />
                            <span className="font-mono text-[10.5px] uppercase tracking-[0.12em]">or</span>
                            <div className="h-px flex-1 bg-border" />
                        </div>

                        <Button
                            variant="secondary"
                            onPress={() => undefined}
                            isDisabled
                            className="mt-5 gap-2.5"
                        >
                            <span className="h-1.5 w-1.5 rounded-full bg-voice" />
                            Self-host a new instance
                        </Button>
                    </>
                )}
            </AnimatedContent>
        </AuthShell>
    )
}

/** Strip protocol + trailing slashes for a cleaner caption. */
function prettyHost(url: string): string {
    try {
        return new URL(url).host
    } catch {
        return url.replace(/^https?:\/\//, "").replace(/\/+$/, "")
    }
}
