import { createFileRoute } from "@tanstack/react-router"
import { CallbackPage } from "@/presentation/pages/callback/CallbackPage"

export const Route = createFileRoute("/callback")({
    component: CallbackPage,
})
