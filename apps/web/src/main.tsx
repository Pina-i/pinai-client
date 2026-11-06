import { RouterProvider, createRouter } from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AppToaster } from "@/presentation/organisms/AppToaster/AppToaster"
import { AppUpdateNotice } from "@/presentation/organisms/AppUpdateNotice/AppUpdateNotice"
import { TitleBar } from "@/presentation/organisms/TitleBar/TitleBar"
import { IN_DESKTOP_APP } from "@/presentation/_libs/client-download"
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
                {IN_DESKTOP_APP && <TitleBar />}
                <RouterProvider router={router} />
                <AppToaster />
                <AppUpdateNotice />
            </AppearanceProvider>
        </QueryClientProvider>
    </StrictMode>
)
