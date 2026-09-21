import { RefreshCw, ShieldCheck, ShieldOff } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"
import { useSecurityEditorViewModel } from "./SecurityEditor.viewmodel"

interface CodePromptPaneProps {
    title: string
    description: string
    submitLabel: string
    destructive?: boolean
    code: string
    setCode: (v: string) => void
    error: string | null
    busy: boolean
    onSubmit: () => void
    onCancel: () => void
}

function CodePromptPane({
    title,
    description,
    submitLabel,
    destructive,
    code,
    setCode,
    error,
    busy,
    onSubmit,
    onCancel,
}: CodePromptPaneProps) {
    return (
        <div className="space-y-5">
            <div>
                <h3 className="title text-[18px] font-normal tracking-[-0.005em] text-foreground">
                    {title}
                </h3>
                <p className="mt-1.5 text-[12.5px] text-muted-foreground">{description}</p>
            </div>
            <OtpInput
                value={code}
                onChange={setCode}
                onComplete={onSubmit}
                autoFocus
                label="Authenticator code"
                error={error ?? undefined}
            />
            <div className="flex items-center gap-3">
                <Button
                    variant={destructive ? "destructive" : "primary"}
                    onPress={onSubmit}
                    isDisabled={busy || code.length !== 6}
                >
                    {busy ? "Working…" : submitLabel}
                </Button>
                <Button variant="secondary" onPress={onCancel} isDisabled={busy}>
                    Cancel
                </Button>
            </div>
        </div>
    )
}

export function SecurityEditor() {
    const vm = useSecurityEditorViewModel()

    return (
        <div className="flex flex-1 flex-col bg-card px-8 py-[30px]">
            <p className="mono-eyebrow mb-[5px] tracking-[0.14em] text-muted-foreground">
                Editing · Security
            </p>
            <h2 className="title text-[24px] font-normal leading-tight tracking-[-0.01em] text-foreground">
                Two-factor authentication.
            </h2>

            <div className="mt-8 max-w-md">
                {!vm.totpEnabled && vm.pane === "idle" && (
                    <div className="space-y-5">
                        <div className="rounded-[var(--radius)] border border-border bg-[color-mix(in_oklab,var(--card)_50%,transparent)] p-5">
                            <p className="mono-eyebrow text-muted-foreground">— 2FA · off</p>
                            <p className="mt-2 text-[13px] text-foreground">
                                Add a second factor with an authenticator app. You'll be asked for a
                                6-digit code every time you sign in.
                            </p>
                        </div>
                        <Button onPress={vm.startEnroll}>
                            <span className="inline-flex items-center gap-2">
                                <ShieldCheck size={16} />
                                Enable 2FA
                            </span>
                        </Button>
                    </div>
                )}

                {vm.totpEnabled && vm.pane === "idle" && (
                    <div className="space-y-5">
                        <div className="rounded-[var(--radius)] border border-border bg-[color-mix(in_oklab,var(--success)_8%,transparent)] p-5">
                            <p className="mono-eyebrow text-success">— 2FA · on</p>
                            <p className="mt-2 text-[13px] text-foreground">
                                You'll be prompted for an authenticator code on every sign-in. Keep
                                your recovery codes somewhere safe.
                            </p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <Button variant="secondary" onPress={() => vm.setPane("regenerate")}>
                                <span className="inline-flex items-center gap-2">
                                    <RefreshCw size={16} />
                                    Generate new recovery codes
                                </span>
                            </Button>
                            <Button variant="destructive" onPress={() => vm.setPane("disable")}>
                                <span className="inline-flex items-center gap-2">
                                    <ShieldOff size={16} />
                                    Disable 2FA
                                </span>
                            </Button>
                        </div>
                    </div>
                )}

                {vm.pane === "disable" && (
                    <CodePromptPane
                        title="Confirm disabling 2FA"
                        description="Type a current authenticator code to confirm. Your recovery codes will be invalidated."
                        submitLabel="Disable 2FA"
                        destructive
                        code={vm.code}
                        setCode={vm.setCode}
                        error={vm.error}
                        busy={vm.busy}
                        onSubmit={vm.submitDisable}
                        onCancel={vm.reset}
                    />
                )}

                {vm.pane === "regenerate" && (
                    <CodePromptPane
                        title="Regenerate recovery codes"
                        description="Type a current authenticator code. Your existing recovery codes will stop working immediately."
                        submitLabel="Generate new codes"
                        code={vm.code}
                        setCode={vm.setCode}
                        error={vm.error}
                        busy={vm.busy}
                        onSubmit={vm.submitRegenerate}
                        onCancel={vm.reset}
                    />
                )}
            </div>
        </div>
    )
}
