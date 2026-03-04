import pinaiLogo from "@/assets/pinai-logo.svg"
import { Tabs, type TabItem } from "@/presentation/molecules/Tabs/Tabs"
import { useLoginPageViewModel, type LoginTab } from "./LoginPage.viewmodel"
import { RegisterForm } from "./RegisterForm/RegisterForm"
import { SignInForm } from "./SignInForm/SignInForm"

export function LoginPage() {
    const { idpUrl, oidcParams, activeTab, setActiveTab, error } = useLoginPageViewModel()

    const tabs: TabItem[] = [
        {
            id: "signin",
            label: "Sign in",
            content: (
                <>
                    {error && (
                        <p
                            className="text-destructive text-xs"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                    <SignInForm
                        idpUrl={idpUrl}
                        params={oidcParams}
                    />
                </>
            ),
        },
        {
            id: "register",
            label: "Register",
            content: (
                <>
                    {error && (
                        <p
                            className="text-destructive text-xs"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                    <RegisterForm
                        idpUrl={idpUrl}
                        params={oidcParams}
                    />
                </>
            ),
        },
    ]

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
            <div className="w-full max-w-sm space-y-8">
                <div className="flex items-start justify-center space-x-3">
                    <img
                        src={pinaiLogo}
                        alt="Pīna'i logo"
                        className="h-16"
                    />
                    <div className="text-center">
                        <h1 className="text-5xl font-bold tracking-tight text-foreground">Pīna&apos;i</h1>
                        <p className="text-muted-foreground text-sm">{activeTab === "signin" ? "Sign in to continue" : "Create your account"}</p>
                    </div>
                </div>

                <div
                    className="bg-card border border-border p-6"
                    style={{ boxShadow: "var(--shadow)" }}
                >
                    <Tabs
                        tabs={tabs}
                        selectedKey={activeTab}
                        onSelectionChange={(key) => setActiveTab(key as LoginTab)}
                        tabListClassName="-mx-6 px-6 text-center uppercase font-bold"
                    />
                </div>

                <p className="text-center text-xs text-muted-foreground">Self-hosted · Federated · Open source</p>
            </div>
        </div>
    )
}
