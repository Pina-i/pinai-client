import { Redirect, Stack } from "expo-router"
import { ReachShell } from "@/presentation/templates/reach/reach-shell"
import { useAppStore } from "@/store/store"

export default function AppLayout() {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    if (!signedIn) return <Redirect href="/" />
    return (
        <ReachShell>
            <Stack screenOptions={{ headerShown: false, animation: "fade", contentStyle: { backgroundColor: "transparent" } }} />
        </ReachShell>
    )
}
