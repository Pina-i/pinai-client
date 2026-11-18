import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { useAppStore } from "@/store/store"
import { FriendsPanel } from "./FriendsPanel/FriendsPanel"

export function HomePage() {
    const user = useAppStore((s) => s.user)
    const navigate = useNavigate()

    const navigateToDm = useCallback(
        (name: string) => {
            navigate({ to: "/dm/$name", params: { name } })
        },
        [navigate],
    )

    if (!user) return null

    return (
        <PageTransition className="flex min-h-0 flex-1">
            <FriendsPanel onStartDm={navigateToDm} />
        </PageTransition>
    )
}
