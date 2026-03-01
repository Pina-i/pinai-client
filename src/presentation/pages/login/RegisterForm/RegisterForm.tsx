import { Button } from "@/presentation/atoms/Button/Button"
import { TextField } from "@/presentation/atoms/TextField/TextField"
import type { OidcParams } from "../LoginPage.viewmodel"
import { LockKeyhole, Mail, User } from "lucide-react"

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

export function RegisterForm({ idpUrl, params }: { idpUrl: string; params: OidcParams }) {
    return (
        <form action={`${idpUrl}/register-and-login`} method="POST" className="space-y-4">
            <HiddenOidcFields params={params} />
            <TextField
                name="username"
                label="Username"
                autoComplete="username"
                icon={<User size={16} />}
                isRequired
            />
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
                autoComplete="new-password"
                icon={<LockKeyhole size={16} />}
                isRequired
            />
            <Button type="submit">Create account</Button>
        </form>
    )
}
