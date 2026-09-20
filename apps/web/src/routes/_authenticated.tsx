import { useEffect } from "react"
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { AnimatePresence, motion } from "motion/react"
import { useAppStore } from "@/store/store"
import { isTokenValid } from "@/domain/models/auth"
import { ensureAuthenticatedUseCase } from "@/domain/usecases/auth/ensureAuthenticated.usecase"
import { getAuthPlatform, getAuthPort } from "@/ioc/index"
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
import { useMinimumLoadingDuration } from "@/presentation/hooks/useMinimumLoadingDuration"
import { useTypingPruner } from "@/presentation/hooks/useTypingPruner"
import { useLoadPresence } from "@/presentation/hooks/useLoadPresence"
import { HomeLayout } from "@/presentation/templates/HomeLayout/HomeLayout"
import { Button } from "@/presentation/atoms/Button/Button"
import { cn } from "@/presentation/_libs/utils"

/**
 * Smooth even the very fastest gate probe so its loader is visible
 * long enough to register as intentional. Tweak in one place; every
 * loader on the platform can reuse `useMinimumLoadingDuration`.
 */
const GATE_LOADER_MIN_MS = 600

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

    const probing = gate.status === "loading" || gate.status === "redirecting"
    // Hold the loader visible for at least 600 ms even when the
    // probe resolves faster — see `useMinimumLoadingDuration`.
    const showLoader = useMinimumLoadingDuration(probing, GATE_LOADER_MIN_MS)
    const showError = gate.status === "error"

    return (
        <>
            <AnimatePresence mode="wait">
                {showLoader && (
                    <motion.div
                        key="onboarding-gate-loader"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                        <OnboardingGatePlaceholder />
                    </motion.div>
                )}
                {!showLoader && showError && (
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
            {!showLoader && !showError && (
                <HomeLayout>
                    <Outlet />
                </HomeLayout>
            )}
        </>
    )
}

function OnboardingGatePlaceholder() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 rounded-full bg-chat animate-bounce [animation-delay:0ms]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-chat animate-bounce [animation-delay:150ms]" />
                    <div className="h-1.5 w-1.5 rounded-full bg-chat animate-bounce [animation-delay:300ms]" />
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">
                    Preparing your encrypted space…
                </p>
            </div>
        </div>
    )
}

function OnboardingGateError({ onRetry }: { onRetry: () => void }) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4">
            <div
                className={cn(
                    "flex max-w-sm flex-col items-center gap-3 rounded-[var(--radius)]",
                    "border border-destructive/40 bg-card p-6 text-center",
                )}
            >
                <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-destructive">
                    Couldn't reach your IdP
                </p>
                <p className="text-[12.5px] text-muted-foreground">
                    Check your connection and try again. Your account is safe.
                </p>
                <Button
                    onPress={onRetry}
                    variant="primary"
                    className="mt-2 rounded-[8px] bg-chat px-4 py-2 text-[12.5px] font-semibold text-primary-foreground"
                >
                    Try again
                </Button>
            </div>
        </div>
    )
}

export const Route = createFileRoute("/_authenticated")({
    beforeLoad: async () => {
        const { accessToken, idpUrl } = useAppStore.getState()
        try {
            await ensureAuthenticatedUseCase(isTokenValid(accessToken), idpUrl, getAuthPort(), getAuthPlatform())
        } catch {
            throw redirect({ to: "/" })
        }
    },
    component: AuthenticatedLayout,
})
