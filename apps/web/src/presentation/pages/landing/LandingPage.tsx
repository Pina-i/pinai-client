import { ArrowRight } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { TextField } from "@/presentation/atoms/TextField/TextField"
import { AnimatedContent } from "@/presentation/atoms/animated-content/animated-content"
import { RiseLoader } from "@/presentation/atoms/rise-loader/rise-loader"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"
import { useLandingPageViewModel } from "./LandingPage.viewmodel"

export function LandingPage() {
    const { idpUrl, setIdpUrl, idpHost, view, loading, error, handleLogin } = useLandingPageViewModel()

    return (
        <AuthShell>
            {/* Crossfade, so the loader mounts on the click: the IdP redirect can leave within a few
                frames, and the loader must have handed its title to the next page by then. */}
            <AnimatedContent contentKey={view} mode="crossfade">
                {view === "connecting" ? (
                    <RiseLoader title="Connection to the island…" host={idpHost} carryOver />
                ) : (
                    <>
                        <p className="eye">— Welcome</p>
                        <h2 className="title mt-2 text-[32px] font-normal tracking-[-0.015em] text-foreground">
                            Pick your home
                        </h2>
                        <p className="mb-[22px] mt-3 text-[13.5px] leading-[1.55] text-muted-foreground">
                            Pīna'i is federated. Tell us where your identity lives and we'll take you there.
                        </p>

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
                            className="mt-[18px]"
                        >
                            Continue
                            <ArrowRight className="h-[15px] w-[15px]" />
                        </Button>

                        <div className="my-5 flex items-center gap-3">
                            <span className="h-px flex-1 bg-line2" />
                            <span className="eye lowercase">or</span>
                            <span className="h-px flex-1 bg-line2" />
                        </div>

                        <Button variant="secondary" onPress={() => undefined} isDisabled>
                            <span className="h-1.5 w-1.5 rounded-full bg-sec" />
                            Self-host a new instance
                        </Button>
                    </>
                )}
            </AnimatedContent>
        </AuthShell>
    )
}

