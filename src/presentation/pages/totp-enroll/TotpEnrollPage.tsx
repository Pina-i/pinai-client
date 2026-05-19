import { ArrowLeft, ShieldCheck } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/presentation/atoms/Button/Button"
import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"
import { QrCode } from "@/presentation/molecules/QrCode/QrCode"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"
import { useTotpEnrollPageViewModel } from "./TotpEnrollPage.viewmodel"

const LEFT_HEADLINE = (
    <>
        Lock <em className="font-light italic text-chat">it</em> down.
    </>
)
const LEFT_DESCRIPTION =
    "Add a second factor with an authenticator app. You'll be asked for a 6-digit code every time you sign in."

export function TotpEnrollPage() {
    const vm = useTotpEnrollPageViewModel()
    const navigate = useNavigate()

    return (
        <AuthShell leftHeadline={LEFT_HEADLINE} leftDescription={LEFT_DESCRIPTION}>
            <div className="mb-7">
                <div className="flex items-center justify-between gap-3">
                    <p className="mono-eyebrow">— Enable 2FA</p>
                    <button
                        type="button"
                        onClick={() => navigate({ to: "/home" })}
                        className="-mr-2 inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-foreground"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        Cancel
                    </button>
                </div>
                <h2 className="title mt-2 text-[32px] font-normal leading-tight tracking-[-0.015em] text-foreground">
                    Scan and verify
                </h2>
                <p className="mt-2 max-w-sm text-[13.5px] leading-[1.55] text-muted-foreground">
                    Open your authenticator app, scan the QR code, then type the 6-digit code to confirm.
                </p>
            </div>

            {vm.bootError && (
                <p className="mb-3 text-xs text-destructive" role="alert">
                    {vm.bootError}
                </p>
            )}

            {vm.provisioningUrl && (
                <div className="space-y-5">
                    <div className="flex items-start gap-4">
                        <QrCode value={vm.provisioningUrl} />
                        <div className="flex-1">
                            <p className="mono-eyebrow text-muted-foreground">— Can't scan?</p>
                            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                                Type this secret into your authenticator manually:
                            </p>
                            <code className="mt-2 block break-all rounded-[var(--radius)] bg-input/50 p-2.5 font-mono text-[12px] tracking-[0.04em] text-foreground">
                                {vm.secretBase32}
                            </code>
                        </div>
                    </div>

                    <OtpInput
                        value={vm.code}
                        onChange={vm.setCode}
                        onComplete={vm.verify}
                        autoFocus
                        label="6-digit code"
                        error={vm.verifyError ?? undefined}
                    />
                    <Button onPress={vm.verify} isDisabled={vm.code.length !== 6 || vm.submitting}>
                        <span className="inline-flex items-center gap-2">
                            <ShieldCheck size={16} />
                            {vm.submitting ? "Verifying…" : "Verify and continue"}
                        </span>
                    </Button>
                </div>
            )}
        </AuthShell>
    )
}
