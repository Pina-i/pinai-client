import { createFileRoute, redirect } from "@tanstack/react-router"
import { LandingPage } from "@/presentation/pages/landing/LandingPage"
import { resumeKeptSession } from "@/routes/-require-session"
import { useAppStore } from "@/store/store"
import { isTokenValid } from "@pinai/domain/models/auth"

export const Route = createFileRoute("/")({
    beforeLoad: async () => {
        await resumeKeptSession()
        if (isTokenValid(useAppStore.getState().accessToken)) {
            throw redirect({ to: "/home" })
        }
    },
    component: LandingPage,
})
