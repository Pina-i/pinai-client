import { ArrowLeft } from "lucide-react"
import { AnimatedContent } from "@/presentation/atoms/animated-content/animated-content"
import { Tabs, type TabItem } from "@/presentation/molecules/Tabs/Tabs"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"
import { useLoginPageViewModel, type LoginTab } from "./LoginPage.viewmodel"
import { RegisterForm } from "./RegisterForm/RegisterForm"
import { SignInForm } from "./SignInForm/SignInForm"

export function LoginPage() {
    const { idpUrl, idpHost, oidcParams, activeTab, setActiveTab, error, handleBack } =
        useLoginPageViewModel()

    const tabs: TabItem[] = [
        {
            id: "signin",
            label: "Sign in",
            content: (
                <>
                    {error && (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                            {error}
                        </p>
                    )}
                    <SignInForm idpUrl={idpUrl} params={oidcParams} />
                </>
            ),
        },
        {
            id: "register",
            label: "Register",
            content: (
                <>
                    {error && (
                        <p className="mb-3 text-xs text-destructive" role="alert">
                            {error}
                        </p>
                    )}
                    <RegisterForm idpUrl={idpUrl} params={oidcParams} />
                </>
            ),
        },
    ]

    return (
        <AuthShell>
            <div className="mb-7">
                <div className="flex items-center justify-between gap-3">
                    <p className="mono-eyebrow">— Welcome back</p>
                    <button
                        type="button"
                        onClick={handleBack}
                        className="-mr-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Back
                    </button>
                </div>
                <AnimatedContent contentKey={activeTab}>
                    <h2 className="title mt-2 text-[32px] font-normal leading-tight tracking-[-0.015em] text-foreground">
                        {activeTab === "signin" ? "Sign in to continue" : "Create your account"}
                    </h2>
                </AnimatedContent>
                {idpHost && (
                    <p className="mt-2 font-mono text-[11px] tracking-[0.04em] text-muted-foreground">
                        <span className="mr-1.5 text-chat">●</span>
                        Connecting to <span className="text-foreground">{idpHost}</span>
                    </p>
                )}
            </div>

            <Tabs
                tabs={tabs}
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as LoginTab)}
                variant="pill"
            />
        </AuthShell>
    )
}
