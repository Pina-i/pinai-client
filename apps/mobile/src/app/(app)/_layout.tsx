import { Redirect, Stack } from "expo-router"
import { useEffect } from "react"
import { View } from "react-native"
import { publishHistoryReset } from "@/presentation/_libs/history-reset"
import { useOnboardingGate } from "@/presentation/hooks/use-onboarding-gate"
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
    if (!signedIn) return <Redirect href="/" />
    if (gate.status === "failed") return <GateFailedPage onRetry={gate.retry} />
    // Nothing of the app shows before the device is known to be in.
    if (gate.status !== "in") return <View style={{ flex: 1 }} />
    return (
        <ReachShell>
            <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
        </ReachShell>
    )
}
