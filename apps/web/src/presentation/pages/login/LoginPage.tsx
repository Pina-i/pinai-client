import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
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
                        <p className="mb-3 text-xs text-dnd" role="alert">
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
                        <p className="mb-3 text-xs text-dnd" role="alert">
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
            <div className="flex items-baseline justify-between">
                <p className="eye">— Welcome back</p>
                <IconButton variant="ghost" onPress={handleBack} className="w-auto px-1.5 text-[11px] font-medium">
                    ← Back
                </IconButton>
            </div>
            <AnimatedContent contentKey={activeTab}>
                <h2 className="title mt-2 text-[32px] font-normal tracking-[-0.015em] text-foreground">
                    {activeTab === "signin" ? "Sign in to continue" : "Create your account"}
                </h2>
            </AnimatedContent>
            <p className="mb-5 mt-2 text-[12px] text-muted-foreground">
                {idpHost && (
                    <>
                        <span className="mr-1.5 text-acc">●</span>
                        Connecting to <span className="font-mono text-[11px] text-foreground">{idpHost}</span>
                    </>
                )}
            </p>

            <Tabs
                tabs={tabs}
                selectedKey={activeTab}
                onSelectionChange={(key) => setActiveTab(key as LoginTab)}
                variant="pill"
            />
        </AuthShell>
    )
}
