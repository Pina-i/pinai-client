import { Redirect, Stack } from "expo-router"
import { useEffect } from "react"
import { View } from "react-native"
import { startAppRuntime } from "@/presentation/_libs/app-runtime"
import { publishHistoryReset } from "@/presentation/_libs/history-reset"
import { useOnboardingGate } from "@/presentation/hooks/use-onboarding-gate"
import { ApprovalDoor } from "@/presentation/organisms/approval-door/approval-door"
import { StartOverPrompt } from "@/presentation/organisms/start-over-prompt/start-over-prompt"
import { GateFailedPage } from "@/presentation/pages/gate-failed/gate-failed"
import { ReachShell } from "@/presentation/templates/reach/reach-shell"
import { useAppStore } from "@/store/store"

export default function AppLayout() {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const gate = useOnboardingGate()
    const { reset, recheck } = gate
    useEffect(() => {
        publishHistoryReset({ reset, recheck })
        return () => publishHistoryReset(null)
    }, [reset, recheck])
    const isIn = signedIn && gate.status === "in"
    useEffect(() => (isIn ? startAppRuntime() : undefined), [isIn])
    if (!signedIn) return <Redirect href="/" />
    if (gate.status === "failed") return <GateFailedPage onRetry={gate.retry} />
    // Nothing of the app shows before the device is known to be in.
    if (gate.status !== "in") return <View style={{ flex: 1 }} />
    return (
        <ReachShell>
            <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
            <ApprovalDoor />
            <StartOverPrompt />
        </ReachShell>
    )
}
