import { ArrowRight, Mail, RotateCcw } from "lucide-react"
import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"
import { useVerifyEmailPageViewModel, type VerifyOidcParams } from "./VerifyEmailPage.viewmodel"

const LEFT_HEADLINE = (
    <>
        Almost <em className="font-light italic text-chat">in.</em>
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
    const baseStyle = {
        minHeight: 22,
        fontFamily: "var(--font-mono)",
        fontSize: 11.5,
        letterSpacing: "0.04em",
    } as const
    const dotStyle = (bg: string, opacity = 1) => ({
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: bg,
        opacity,
    })

    if (serverError) {
        return (
            <div className="flex items-center gap-2" style={{ ...baseStyle, color: "var(--destructive)" }}>
                <span style={dotStyle("var(--destructive)")} />
                {serverError}
            </div>
        )
    }
    if (resendError) {
        return (
            <div className="flex items-center gap-2" style={{ ...baseStyle, color: "var(--destructive)" }}>
                <span style={dotStyle("var(--destructive)")} />
                {resendError}
            </div>
        )
    }
    if (justResent) {
        return (
            <div className="flex items-center gap-2" style={{ ...baseStyle, color: "var(--success)" }}>
                <span style={dotStyle("var(--success)")} />
                New code sent. The previous one no longer works.
            </div>
        )
    }
    if (typed > 0) {
        return (
            <div className="flex items-center gap-2" style={{ ...baseStyle, color: "var(--chat)" }}>
                <span style={{ ...dotStyle("var(--chat)"), animation: "pn-pulse 1.8s ease-in-out infinite" }} />
                {typed} of 6 typed · paste with ⌘V
            </div>
        )
    }
    return (
        <div className="flex items-center gap-2" style={{ ...baseStyle, color: "var(--muted-foreground)" }}>
            <span style={dotStyle("var(--muted-foreground)", 0.5)} />
            Codes expire in 10 minutes.
        </div>
    )
}

export function VerifyEmailPage() {
    const vm = useVerifyEmailPageViewModel()
    const canSubmit = vm.code.length === 6 && !!vm.idpUrl && !!vm.pendingUserId

    return (
        <AuthShell leftHeadline={LEFT_HEADLINE} leftDescription={LEFT_DESCRIPTION}>
            <div className="w-full" style={{ maxWidth: 420 }}>
                <div className="mb-[22px]">
                    <button
                        type="button"
                        onClick={vm.goToLogin}
                        className="inline-flex cursor-pointer items-center gap-1.5 text-muted-foreground transition-colors hover:text-foreground"
                        style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 10.5,
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                        }}
                    >
                        ← back to sign in
                    </button>
                    <h2
                        className="title mt-2.5 text-foreground"
                        style={{
                            fontSize: 32,
                            fontWeight: 400,
                            margin: "10px 0 12px",
                            letterSpacing: "-0.015em",
                            lineHeight: 1.1,
                        }}
                    >
                        Check your inbox.
                    </h2>
                    <p
                        className="text-muted-foreground"
                        style={{ margin: "0 0 18px", fontSize: 13.5, lineHeight: 1.55, maxWidth: 380 }}
                    >
                        We just sent a one-time code to
                    </p>

                    {vm.pendingEmail && (
                        <div
                            className="inline-flex items-center"
                            style={{
                                gap: 10,
                                padding: "8px 12px 8px 10px",
                                borderRadius: 999,
                                background: "var(--card)",
                                border: "1px solid var(--border)",
                            }}
                        >
                            <span style={{ color: "var(--muted-foreground)", display: "flex" }}>
                                <Mail size={14} />
                            </span>
                            <span
                                style={{
                                    fontFamily: "var(--font-mono)",
                                    fontSize: 11.5,
                                    color: "var(--foreground)",
                                    letterSpacing: "0.02em",
                                }}
                            >
                                {vm.pendingEmail}
                            </span>
                        </div>
                    )}
                </div>

                <form
                    ref={vm.formRef}
                    action={`${vm.idpUrl}/verify-email-and-login`}
                    method="POST"
                >
                    <HiddenFields
                        pendingUserId={vm.pendingUserId}
                        pendingEmail={vm.pendingEmail}
                        code={vm.code}
                        params={vm.oidcParams}
                    />

                    <OtpInput
                        value={vm.code}
                        onChange={vm.setCode}
                        onComplete={vm.submitForm}
                        autoFocus
                        label="Six-digit code"
                    />

                    <div style={{ marginTop: 10, marginBottom: 18 }}>
                        <StatusRow
                            typed={vm.code.length}
                            justResent={vm.justResent}
                            resendError={vm.resendError}
                            serverError={vm.error}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={!canSubmit}
                        className="w-full cursor-pointer disabled:cursor-not-allowed"
                        style={{
                            padding: "12px 14px",
                            borderRadius: "var(--radius)",
                            background: canSubmit
                                ? "var(--chat)"
                                : "color-mix(in oklab, var(--chat) 30%, transparent)",
                            color: canSubmit
                                ? "var(--primary-foreground)"
                                : "color-mix(in oklab, var(--primary-foreground) 55%, transparent)",
                            border: "none",
                            fontWeight: 600,
                            fontSize: 13.5,
                            fontFamily: "inherit",
                            letterSpacing: "0.005em",
                            boxShadow: canSubmit
                                ? "0 1px 0 rgba(255,255,255,0.15) inset, 0 8px 24px -8px color-mix(in oklab, var(--chat) 40%, transparent)"
                                : "none",
                        }}
                    >
                        <span className="inline-flex items-center justify-center gap-1.5">
                            Verify and continue
                            <ArrowRight size={15} />
                        </span>
                    </button>
                </form>

                <div
                    className="flex items-center gap-3 text-muted-foreground"
                    style={{ margin: "22px 0 16px", fontSize: 11 }}
                >
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                    <span
                        style={{
                            fontFamily: "var(--font-mono)",
                            letterSpacing: "0.12em",
                            textTransform: "uppercase",
                        }}
                    >
                        didn't get it?
                    </span>
                    <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
                </div>

                <div className="flex items-center" style={{ gap: 10 }}>
                    <button
                        type="button"
                        onClick={vm.resend}
                        disabled={vm.cooldown > 0 || vm.resending}
                        className="flex flex-1 cursor-pointer items-center justify-center disabled:cursor-not-allowed"
                        style={{
                            padding: "11px 14px",
                            borderRadius: "var(--radius)",
                            background: "transparent",
                            color: vm.cooldown > 0 ? "var(--muted-foreground)" : "var(--foreground)",
                            border: "1px solid var(--border-strong)",
                            fontSize: 13,
                            fontFamily: "inherit",
                            gap: 10,
                        }}
                    >
                        <RotateCcw size={14} />
                        {vm.cooldown > 0 ? (
                            <>
                                Resend in{" "}
                                <span style={{ fontFamily: "var(--font-mono)", color: "var(--chat)" }}>
                                    {formatCooldown(vm.cooldown)}
                                </span>
                            </>
                        ) : vm.resending ? (
                            "Sending…"
                        ) : (
                            "Send a new code"
                        )}
                    </button>
                </div>

                <p
                    className="text-muted-foreground"
                    style={{ margin: "18px 0 0", fontSize: 11.5, lineHeight: 1.55, maxWidth: 380 }}
                >
                    Still nothing? Check your spam folder, or{" "}
                    <a
                        href="#support"
                        className="cursor-pointer underline"
                        style={{ color: "var(--chat)", textUnderlineOffset: 3 }}
                    >
                        contact support
                    </a>
                    .
                </p>
            </div>
        </AuthShell>
    )
}
