import { useState } from "react"
import { Button } from "@/presentation/atoms/Button/Button"
import { TextField } from "@/presentation/atoms/TextField/TextField"
import type { OidcParams } from "../LoginPage.viewmodel"
import { Loader2, LockKeyhole, Mail } from "lucide-react"

function HiddenOidcFields({ params }: { params: OidcParams }) {
    return (
        <>
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

export function SignInForm({ idpUrl, params }: { idpUrl: string; params: OidcParams }) {
    // Native form POST navigates the page away after submit — flipping
    // this lets us swap the button label for a spinner during that
    // ~200-500 ms gap and prevents double-submits.
    const [submitting, setSubmitting] = useState(false)
    return (
        <form
            action={`${idpUrl}/login`}
            method="POST"
            className="space-y-4"
            onSubmit={() => setSubmitting(true)}
        >
            <HiddenOidcFields params={params} />
            <TextField
                name="email"
                type="email"
                label="Email"
                autoComplete="email"
                icon={<Mail size={16} />}
                isRequired
            />
            <TextField
                name="password"
                type="password"
                label="Password"
                autoComplete="current-password"
                icon={<LockKeyhole size={16} />}
                isRequired
            />
            <Button type="submit" isDisabled={submitting} aria-label="Sign in">
                {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                    "Sign in"
                )}
            </Button>
        </form>
    )
}
