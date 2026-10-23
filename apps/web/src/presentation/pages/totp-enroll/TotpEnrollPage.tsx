import { ShieldCheck } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@/presentation/atoms/Button/Button"
import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"
import { QrCode } from "@/presentation/molecules/QrCode/QrCode"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"
import { useTotpEnrollPageViewModel } from "./TotpEnrollPage.viewmodel"

const LEFT_HEADLINE = (
    <>
        Lock <em className="italic text-acc">it</em> down.
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
                <div className="flex items-baseline justify-between gap-3">
                    <p className="eye">— Enable 2FA</p>
                    <button
                        type="button"
                        onClick={() => navigate({ to: "/home" })}
                        className="cursor-pointer rounded-full px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        ← Cancel
                    </button>
                </div>
                <h2 className="title mt-2 text-[32px] font-normal tracking-[-0.015em] text-foreground">
                    Scan and verify
                </h2>
                <p className="mt-2 max-w-sm text-[13.5px] leading-[1.55] text-muted-foreground">
                    Open your authenticator app, scan the QR code, then type the 6-digit code to confirm.
                </p>
            </div>

            {vm.bootError && (
                <p className="mb-3 text-xs text-dnd" role="alert">
                    {vm.bootError}
                </p>
            )}

            {vm.recentSignIn.asking && (
                <div className="flex flex-col gap-[18px]">
                    <p className="text-[13.5px] leading-[1.55] text-muted-foreground">
                        To {vm.recentSignIn.asking}, sign in again on{" "}
                        <span className="font-medium text-foreground">{vm.recentSignIn.host}</span>. You'll come back
                        right here.
                    </p>
                    <Button onPress={vm.recentSignIn.signInAgain} isDisabled={vm.recentSignIn.isLeaving}>
                        {vm.recentSignIn.isLeaving ? "Taking you there…" : "Type your password again"}
                    </Button>
                </div>
            )}

            {vm.provisioningUrl && (
                <div className="flex flex-col gap-[18px]">
                    <div className="flex items-start gap-4">
                        <QrCode value={vm.provisioningUrl} />
                        <div className="flex-1">
                            <p className="eye">— Can't scan?</p>
                            <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                                Type this secret into your authenticator manually:
                            </p>
                            <code className="mt-2 block break-all rounded-[12px] border border-line bg-surf2 px-3 py-2.5 font-mono text-[12px] tracking-[0.04em] text-foreground">
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
                        <ShieldCheck size={15} />
                        {vm.submitting ? "Verifying…" : "Verify and continue"}
                    </Button>
                </div>
            )}
        </AuthShell>
    )
}
