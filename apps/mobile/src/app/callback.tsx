import { useLocalSearchParams } from "expo-router"
import { CallbackPage } from "@/presentation/pages/callback/callback"

export default function Callback() {
    const params = useLocalSearchParams<Record<string, string>>()
    return <CallbackPage params={params} />
}
