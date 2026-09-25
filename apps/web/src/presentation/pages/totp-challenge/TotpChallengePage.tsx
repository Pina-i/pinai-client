import { useRef, useState } from "react"
import { KeyRound, ShieldCheck } from "lucide-react"
import { useNavigate } from "@tanstack/react-router"
import { getAuthSessionStore } from "@/ioc/index"
import { Button } from "@/presentation/atoms/Button/Button"
import { OtpInput } from "@/presentation/atoms/OtpInput/OtpInput"
import { TextField } from "@/presentation/atoms/TextField/TextField"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"

type Mode = "totp" | "recovery"

const LEFT_HEADLINE = (
    <>
        One <em className="italic text-acc">more</em> step.
    </>
)
const LEFT_DESCRIPTION =
    "Two-factor authentication is on for this account. Open your authenticator app and type the current code to finish signing in."

export function TotpChallengePage() {
    const search = new URLSearchParams(window.location.search)
    const ticket = search.get("ticket") ?? ""
    const error = search.get("error")
    const idpUrl = getAuthSessionStore().get("idp_url") ?? ""

    const navigate = useNavigate()
    const formRef = useRef<HTMLFormElement | null>(null)
    const [mode, setMode] = useState<Mode>("totp")
    const [code, setCode] = useState("")
    const [recovery, setRecovery] = useState("")

    const canSubmit =
        !!ticket && !!idpUrl && (mode === "totp" ? code.length === 6 : recovery.length >= 10)
    const submitForm = () => formRef.current?.requestSubmit()

    return (
        <AuthShell leftHeadline={LEFT_HEADLINE} leftDescription={LEFT_DESCRIPTION}>
            <div className="mb-7">
                <div className="flex items-baseline justify-between gap-3">
                    <p className="eye">— Second factor</p>
                    <button
                        type="button"
                        onClick={() => navigate({ to: "/login" })}
                        className="cursor-pointer rounded-full px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        ← Cancel
                    </button>
                </div>
                <h2 className="title mt-2 text-[32px] font-normal tracking-[-0.015em] text-foreground">
                    {mode === "totp" ? "Enter the 6-digit code" : "Use a recovery code"}
                </h2>
                <p className="mt-2 max-w-sm text-[13.5px] leading-[1.55] text-muted-foreground">
                    {mode === "totp"
                        ? "Open your authenticator app and type the code currently shown for Pīna'i."
                        : "Type one of the 10 single-use recovery codes you saved when you set up 2FA."}
                </p>
            </div>

            {error && (
                <p className="mb-3 text-xs text-dnd" role="alert">
                    {error}
                </p>
            )}

            <form
                ref={formRef}
                action={`${idpUrl}/login/totp`}
                method="POST"
                className="flex flex-col gap-[18px]"
            >
                <input type="hidden" name="ticket" value={ticket} />
                {mode === "totp" ? (
                    <OtpInput
                        name="code"
                        value={code}
                        onChange={setCode}
                        onComplete={canSubmit ? submitForm : undefined}
                        autoFocus
                        label="Authenticator code"
                    />
                ) : (
                    <TextField
                        name="recovery_code"
                        value={recovery}
                        onChange={setRecovery}
                        label="Recovery code"
                        placeholder="XXXXX-XXXXX"
                        autoFocus
                        icon={<KeyRound size={15} />}
                    />
                )}
                <Button type="submit" isDisabled={!canSubmit}>
                    <ShieldCheck size={15} />
                    Continue
                </Button>
            </form>

            <div className="mt-6 text-center">
                <button
                    type="button"
                    onClick={() => setMode(mode === "totp" ? "recovery" : "totp")}
                    className="cursor-pointer text-[12px] text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
                >
                    {mode === "totp" ? "Use a recovery code instead" : "Use my authenticator app"}
                </button>
            </div>
        </AuthShell>
    )
}
