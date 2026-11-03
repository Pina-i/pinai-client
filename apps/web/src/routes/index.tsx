import { createFileRoute, redirect } from "@tanstack/react-router"
import { LandingPage } from "@/presentation/pages/landing/LandingPage"
import { arriveAtInstance } from "@/presentation/_libs/instance-arrival"
import { signInAgainAfterLogout } from "@/presentation/_libs/device-mismatch"
import { resumeKeptSession } from "@/routes/-require-session"
import { useAppStore } from "@/store/store"
import { isTokenValid } from "@pinai/domain/models/auth"
import type { InstanceArrival } from "@pinai/domain/models/instance"

export const Route = createFileRoute("/")({
    beforeLoad: async ({ location }): Promise<{ arrival: InstanceArrival }> => {
        if (await signInAgainAfterLogout()) return { arrival: { kind: "none" } }
        await resumeKeptSession()
        const arrival = arriveAtInstance(location.searchStr)
        if (arrival.kind === "here" || isTokenValid(useAppStore.getState().accessToken)) {
            throw redirect({ to: "/home" })
        }
        return { arrival }
    },
    component: LandingPage,
})
