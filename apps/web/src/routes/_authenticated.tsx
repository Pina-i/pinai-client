import { useEffect, useMemo } from "react"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { requireSession } from "@/routes/-require-session"
import { AnimatePresence, motion } from "motion/react"
import { useConsumeMlsWelcomes } from "@/presentation/hooks/useConsumeMlsWelcomes"
import { useDeviceFanout } from "@/presentation/hooks/useDeviceFanout"
import { useHistoryArchiveFlusher } from "@/presentation/hooks/useHistoryArchiveFlusher"
import { useIdentityOnboardingGate } from "@/presentation/hooks/useIdentityOnboardingGate"
import {
    registerDeviceFanoutHandler,
    useIdpWebSocket,
} from "@/presentation/hooks/useIdpWebSocket"
import { useLoadPendingNotifications } from "@/presentation/hooks/useLoadPendingNotifications"
import { useLoadDmConversations } from "@/presentation/hooks/useLoadDmConversations"
import { useHeartbeat } from "@/presentation/hooks/useHeartbeat"
import { useTypingPruner } from "@/presentation/hooks/useTypingPruner"
import { useHoldSplashScreen } from "@/presentation/hooks/use-hold-splash-screen"
import { useLoadPresence } from "@/presentation/hooks/useLoadPresence"
import { HomeLayout } from "@/presentation/templates/HomeLayout/HomeLayout"
import { Backdrop } from "@/presentation/atoms/backdrop/backdrop"
import { Button } from "@/presentation/atoms/Button/Button"

function AuthenticatedLayout() {
    // Gate the app shell behind onboarding — bootstrap happens explicitly
    // inside the setup view so the passphrase can be shown to the user.
    const gate = useIdentityOnboardingGate()

    useIdpWebSocket()
    useHeartbeat()
    useTypingPruner()
    useLoadPendingNotifications()
    useLoadDmConversations()
    useLoadPresence()
    useConsumeMlsWelcomes()
    useHistoryArchiveFlusher()
    const { onDeviceJoined } = useDeviceFanout()
    useEffect(() => registerDeviceFanoutHandler(onDeviceJoined), [onDeviceJoined])

    // The splash screen stands in for the gate's loader, so a hard refresh
    // shows one loader from first paint to the shell.
    useHoldSplashScreen(gate.status === "loading" || gate.status === "redirecting")
    const showError = gate.status === "error"

    // The data hooks above re-render this layout on every conversation-list or
    // presence refresh; a stable element keeps that from cascading through the
    // shell. HomeLayout and the Outlet still update through their own subscriptions.
    const shell = useMemo(
        () => (
            <HomeLayout>
                <Outlet />
            </HomeLayout>
        ),
        [],
    )

    return (
        <>
            <AnimatePresence>
                {showError && (
                    <motion.div
                        key="onboarding-gate-error"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 8 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                        <OnboardingGateError onRetry={gate.retry ?? (() => undefined)} />
                    </motion.div>
                )}
            </AnimatePresence>
            {gate.status === "ready" && shell}
        </>
    )
}

function OnboardingGateError({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
            <Backdrop />
            <div className="relative z-[2] flex max-w-sm flex-col items-center gap-3 rounded-[18px] border border-line bg-surf p-6 text-center backdrop-blur-[14px]">
                <p className="fact text-dnd">Couldn't reach your IdP</p>
                <p className="text-[13px] leading-[1.55] text-muted-foreground">
                    Check your connection and try again. Your account is safe.
                </p>
                <Button onPress={onRetry} variant="primary" size="inline" className="mt-2">
                    Try again
                </Button>
            </div>
        </div>
    )
}

export const Route = createFileRoute("/_authenticated")({
    beforeLoad: requireSession,
    component: AuthenticatedLayout,
})
