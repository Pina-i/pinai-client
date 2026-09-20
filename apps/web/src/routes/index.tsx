import { createFileRoute, redirect } from "@tanstack/react-router"
import { LandingPage } from "@/presentation/pages/landing/LandingPage"
import { useAppStore } from "@/store/store"
import { isTokenValid } from "@pinai/domain/models/auth"

export const Route = createFileRoute("/")({
    beforeLoad: () => {
        if (isTokenValid(useAppStore.getState().accessToken)) {
            throw redirect({ to: "/home" })
        }
    },
    component: LandingPage,
})
