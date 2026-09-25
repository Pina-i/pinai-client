import { RefreshCw, ShieldCheck, ShieldOff } from "lucide-react"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"
import { cn } from "@/presentation/_libs/utils"
import { editorFrame, editorTitle, pill } from "../editor-styles"
import { useSecurityEditorViewModel } from "./SecurityEditor.viewmodel"

const actionClass = cn(pill({ variant: "cancel" }), "w-full px-3.5 py-2.5")

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
        <div className="mt-8 max-w-md">
            <h3 className="title text-[18px] font-normal tracking-[-0.005em] text-foreground">{title}</h3>
            <p className="mb-5 mt-1.5 text-[12.5px] leading-[1.55] text-muted-foreground">{description}</p>
            <OtpInput
                value={code}
                onChange={setCode}
                onComplete={onSubmit}
                autoFocus
                label="Authenticator code"
                error={error ?? undefined}
            />
            <div className="mt-5 flex gap-3">
                <IconButton
                    onPress={onSubmit}
                    isDisabled={busy || code.length !== 6}
                    className={pill({ variant: destructive ? "danger" : "save" })}
                >
                    {busy ? "Working…" : submitLabel}
                </IconButton>
                <IconButton onPress={onCancel} isDisabled={busy} className={pill({ variant: "cancel" })}>
                    Cancel
                </IconButton>
            </div>
        </div>
    )
}

export function SecurityEditor() {
    const vm = useSecurityEditorViewModel()

    return (
        <div className={editorFrame}>
            <p className="mono-eyebrow mb-[5px]">Editing · Security</p>
            <h2 className={editorTitle}>Two-factor authentication.</h2>

            {!vm.totpEnabled && vm.pane === "idle" && (
                <>
                    <div className="mt-8 max-w-md rounded-[16px] border border-line p-5">
                        <p className="mono-eyebrow">— 2FA · off</p>
                        <p className="mt-2 text-[13px] leading-[1.55] text-foreground">
                            Add a second factor with an authenticator app. You'll be asked for a
                            6-digit code every time you sign in.
                        </p>
                    </div>
                    <div className="mt-5 flex max-w-md flex-col gap-3">
                        <IconButton onPress={vm.startEnroll} className={cn(pill({ variant: "save" }), "w-full px-3.5 py-2.5")}>
                            <ShieldCheck className="h-[15px] w-[15px]" />
                            Enable 2FA
                        </IconButton>
                    </div>
                </>
            )}

            {vm.totpEnabled && vm.pane === "idle" && (
                <>
                    <div className="mt-8 max-w-md rounded-[16px] border border-line bg-[color-mix(in_oklab,var(--on)_8%,transparent)] p-5">
                        <p className="mono-eyebrow text-on">— 2FA · on</p>
                        <p className="mt-2 text-[13px] leading-[1.55] text-foreground">
                            You'll be prompted for an authenticator code on every sign-in. Keep
                            your recovery codes somewhere safe.
                        </p>
                    </div>
                    <div className="mt-5 flex max-w-md flex-col gap-3">
                        <IconButton onPress={() => vm.setPane("regenerate")} className={actionClass}>
                            <RefreshCw className="h-[15px] w-[15px]" />
                            Generate new recovery codes
                        </IconButton>
                        <IconButton
                            onPress={() => vm.setPane("disable")}
                            className={cn(
                                actionClass,
                                "border-[color-mix(in_oklab,var(--dnd)_45%,transparent)] text-dnd hover:bg-[color-mix(in_oklab,var(--dnd)_8%,transparent)]",
                            )}
                        >
                            <ShieldOff className="h-[15px] w-[15px]" />
                            Disable 2FA
                        </IconButton>
                    </div>
                </>
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
    )
}
