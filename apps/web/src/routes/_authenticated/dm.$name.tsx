import { createFileRoute } from "@tanstack/react-router"
import { ConversationPage } from "@/presentation/pages/conversation/ConversationPage"

function DmRoute() {
    const { name } = Route.useParams()
    return <ConversationPage name={decodeURIComponent(name)} />
}

export const Route = createFileRoute("/_authenticated/dm/$name")({
    component: DmRoute,
})
