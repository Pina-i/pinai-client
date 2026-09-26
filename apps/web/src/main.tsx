import { RouterProvider, createRouter } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"
import { holdSplashScreen } from "@/presentation/_libs/splash-screen"
import { AppearanceProvider } from "@/presentation/providers/AppearanceProvider/AppearanceProvider"
import { routeTree } from "./routeTree.gen"

const router = createRouter({ routeTree })
export const queryClient = new QueryClient()

// Until the first location has rendered; a page still loading by then holds it itself.
const releaseBootSplash = holdSplashScreen()
const stopWaitingForFirstRender = router.subscribe("onRendered", () => {
    stopWaitingForFirstRender()
    releaseBootSplash()
})

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router
    }
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <AppearanceProvider>
                <RouterProvider router={router} />
                <Toaster richColors position="bottom-right" style={{ zIndex: "var(--z-above-grain)" }} />
            </AppearanceProvider>
        </QueryClientProvider>
    </StrictMode>
)
