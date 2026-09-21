import { createFileRoute } from "@tanstack/react-router"
import { HomePage } from "@/presentation/pages/home/HomePage"

export const Route = createFileRoute("/_authenticated/home")({
    component: HomePage,
})
