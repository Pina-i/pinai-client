import { useNavigate } from "@tanstack/react-router"
import { useCallback } from "react"
import { PageTransition } from "@/presentation/atoms/page-transition/page-transition"
import { useAppStore } from "@/store/store"
import { sendFriendRequestUseCase } from "@pinai/domain/usecases/social/send-friend-request.usecase"
import { getSocialPort } from "@/ioc"
import { FriendsPanel } from "./FriendsPanel/FriendsPanel"

export function HomePage() {
    const user = useAppStore((s) => s.user)
    const accessToken = useAppStore((s) => s.accessToken)
    const idpUrl = useAppStore((s) => s.idpUrl)
    const navigate = useNavigate()

    const navigateToDm = useCallback(
        (name: string) => {
            navigate({ to: "/dm/$name", params: { name } })
        },
        [navigate],
    )

    const sendFriendRequest = useCallback(
        async (address: string) => {
            if (!accessToken || !idpUrl) throw new Error("Not authenticated")
            return sendFriendRequestUseCase(idpUrl, accessToken, address, getSocialPort())
        },
        [accessToken, idpUrl],
    )

    if (!user) return null

    return (
        <PageTransition className="flex min-h-0 flex-1">
            <FriendsPanel
                userAddress={user.address}
                onStartDm={navigateToDm}
                onSendFriendRequest={sendFriendRequest}
            />
        </PageTransition>
    )
}
