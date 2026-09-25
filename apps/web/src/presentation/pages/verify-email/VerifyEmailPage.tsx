import { ArrowRight, Mail, RotateCcw } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"
import { cn } from "@/presentation/_libs/utils"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"
import { useVerifyEmailPageViewModel, type VerifyOidcParams } from "./VerifyEmailPage.viewmodel"

const LEFT_HEADLINE = (
    <>
        Almost <em className="italic text-acc">in.</em>
    </>
)
const LEFT_DESCRIPTION =
    "We sent a six-digit code to make sure this inbox is yours. Type it in to finish setting up your account."

function HiddenFields({
    pendingUserId,
    pendingEmail,
    code,
    params,
}: {
    pendingUserId: string
    pendingEmail: string
    code: string
    params: VerifyOidcParams
}) {
    return (
        <>
            <input type="hidden" name="pending_user_id" value={pendingUserId} />
            <input type="hidden" name="pending_email" value={pendingEmail} />
            <input type="hidden" name="code" value={code} />
            <input type="hidden" name="client_id" value={params.client_id} />
            <input type="hidden" name="redirect_uri" value={params.redirect_uri} />
            <input type="hidden" name="scope" value={params.scope} />
            <input type="hidden" name="state" value={params.state} />
            <input type="hidden" name="code_challenge" value={params.code_challenge} />
            <input type="hidden" name="code_challenge_method" value={params.code_challenge_method} />
            {params.nonce && <input type="hidden" name="nonce" value={params.nonce} />}
        </>
    )
}

function formatCooldown(secs: number): string {
    const m = Math.floor(secs / 60)
    const s = secs % 60
    return `${m}:${String(s).padStart(2, "0")}`
}

interface StatusRowProps {
    typed: number
    justResent: boolean
    resendError: string | null
    serverError: string | null
}

function StatusRow({ typed, justResent, resendError, serverError }: StatusRowProps) {
    const row = "flex min-h-[22px] items-center gap-2 font-mono text-[11px] tracking-[0.04em]"
    const dot = "h-1.5 w-1.5 shrink-0 rounded-full"

    const error = serverError ?? resendError
    if (error) {
        return (
            <div className={cn(row, "text-dnd")}>
                <span className={cn(dot, "bg-dnd")} />
                {error}
            </div>
        )
    }
    if (justResent) {
        return (
            <div className={cn(row, "text-on")}>
                <span className={cn(dot, "bg-on")} />
                New code sent. The previous one no longer works.
            </div>
        )
    }
    if (typed > 0) {
        return (
            <div className={cn(row, "text-acc")}>
                <span className={cn(dot, "bg-acc [animation:pn-pulse_1.6s_ease-in-out_infinite]")} />
                {typed} of 6 typed · paste with ⌘V
            </div>
        )
    }
    return (
        <div className={cn(row, "text-muted-foreground")}>
            <span className={cn(dot, "bg-muted-foreground opacity-50")} />
            Codes expire in 10 minutes.
        </div>
    )
}

export function VerifyEmailPage() {
    // The ref is destructured out: `react-hooks/refs` treats every property
    // read on an object that holds a ref as a ref access during render, so
    // keeping it inside `vm` would flag every `vm.code` / `vm.cooldown` too.
    const { formRef, ...vm } = useVerifyEmailPageViewModel()
    const canSubmit = vm.code.length === 6 && !!vm.idpUrl && !!vm.pendingUserId

    return (
        <AuthShell leftHeadline={LEFT_HEADLINE} leftDescription={LEFT_DESCRIPTION}>
            <div className="mb-[22px]">
                <button
                    type="button"
                    onClick={vm.goToLogin}
                    className="cursor-pointer rounded-full text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    ← Back to sign in
                </button>
                <h2 className="title mb-3 mt-2.5 text-[32px] font-normal leading-[1.1] tracking-[-0.015em] text-foreground">
                    Check your inbox.
                </h2>
                <p className="mb-[18px] max-w-[380px] text-[13.5px] leading-[1.55] text-muted-foreground">
                    We just sent a one-time code to
                </p>

                {vm.pendingEmail && (
                    <div className="inline-flex items-center gap-2.5 rounded-full border border-line bg-surf2 py-2 pl-2.5 pr-3 text-muted-foreground">
                        <Mail size={14} />
                        <span className="font-mono text-[11.5px] tracking-[0.02em] text-foreground">
                            {vm.pendingEmail}
                        </span>
                    </div>
                )}
            </div>

            <form ref={formRef} action={`${vm.idpUrl}/verify-email-and-login`} method="POST">
                <HiddenFields
                    pendingUserId={vm.pendingUserId}
                    pendingEmail={vm.pendingEmail}
                    code={vm.code}
                    params={vm.oidcParams}
                />

                <OtpInput
                    value={vm.code}
                    onChange={vm.setCode}
                    onComplete={canSubmit ? vm.submitForm : undefined}
                    autoFocus
                    label="Six-digit code"
                />

                <div className="mb-[18px] mt-2.5">
                    <StatusRow
                        typed={vm.code.length}
                        justResent={vm.justResent}
                        resendError={vm.resendError}
                        serverError={vm.error}
                    />
                </div>

                <Button type="submit" isDisabled={!canSubmit}>
                    Verify and continue
                    <ArrowRight size={15} />
                </Button>
            </form>

            <div className="my-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-line2" />
                <span className="eye">Didn't get it?</span>
                <span className="h-px flex-1 bg-line2" />
            </div>

            <Button variant="secondary" onPress={vm.resend} isDisabled={vm.cooldown > 0 || vm.resending}>
                <RotateCcw size={14} />
                {vm.cooldown > 0 ? (
                    <>
                        Resend in <span className="font-mono text-acc">{formatCooldown(vm.cooldown)}</span>
                    </>
                ) : vm.resending ? (
                    "Sending…"
                ) : (
                    "Send a new code"
                )}
            </Button>

            <p className="mt-[18px] max-w-[380px] text-[11.5px] leading-[1.55] text-muted-foreground">
                Still nothing? Check your spam folder, or{" "}
                <a href="#support" className="cursor-pointer text-acc underline underline-offset-[3px]">
                    contact support
                </a>
                .
            </p>
        </AuthShell>
    )
}
