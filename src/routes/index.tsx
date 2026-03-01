import { createFileRoute, redirect } from "@tanstack/react-router"
import { LandingPage } from "@/presentation/pages/landing/LandingPage"
import { useAppStore } from "@/store/store"
import { isTokenValid } from "@/adapters/auth/token"

export const Route = createFileRoute("/")({
    beforeLoad: () => {
        if (isTokenValid(useAppStore.getState().accessToken)) {
            throw redirect({ to: "/home" })
        }
    },
    component: LandingPage,
})
