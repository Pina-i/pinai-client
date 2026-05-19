import { createFileRoute, redirect } from "@tanstack/react-router"
import { VerifyEmailPage } from "@/presentation/pages/verify-email/VerifyEmailPage"

export const Route = createFileRoute("/verify-email")({
    beforeLoad: () => {
        // Hard-fail when the IdP didn't redirect us here properly — there's
        // no form to fill out without the user id we're trying to verify.
        if (!new URLSearchParams(window.location.search).get("pending_user_id")) {
            throw redirect({ to: "/" })
        }
    },
    component: VerifyEmailPage,
})
