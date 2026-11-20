import { Redirect } from "expo-router"
import { WelcomePage } from "@/presentation/pages/welcome/welcome"
import { useAppStore } from "@/store/store"

export default function Index() {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    return signedIn ? <Redirect href="/home" /> : <WelcomePage />
}
