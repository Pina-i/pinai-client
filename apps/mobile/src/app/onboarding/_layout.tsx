import { Redirect, Stack } from "expo-router"
import { useEffect } from "react"
import { enterAccount } from "@/presentation/_libs/this-device"
import { useAppStore } from "@/store/store"

export default function OnboardingLayout() {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    const actorUri = useAppStore((s) => s.user?.actor_uri ?? null)
    useEffect(() => {
        if (signedIn && actorUri) enterAccount(actorUri)
    }, [signedIn, actorUri])
    if (!signedIn) return <Redirect href="/" />
    return <Stack screenOptions={{ headerShown: false }} />
}
