import { Redirect } from "expo-router"
import { HomePage } from "@/presentation/pages/home/home"
import { useAppStore } from "@/store/store"

export default function Home() {
    const signedIn = useAppStore((s) => s.accessToken !== null)
    return signedIn ? <HomePage /> : <Redirect href="/" />
}
