import { Redirect, Stack } from "expo-router"
import { View } from "react-native"
import { useOnboardingGate } from "@/presentation/hooks/use-onboarding-gate"
import { GateFailedPage } from "@/presentation/pages/gate-failed/gate-failed"
import { ReachShell } from "@/presentation/templates/reach/reach-shell"
import { useAppStore } from "@/store/store"

export default function AppLayout() {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const gate = useOnboardingGate()
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
