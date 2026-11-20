import { useLocalSearchParams } from "expo-router"
import { OpeningPage } from "@/presentation/pages/opening/opening"

export default function Opening() {
    const { origin, name } = useLocalSearchParams<{ origin: string; name: string }>()
    return (
        <OpeningPage
            origin={origin ?? ""}
            name={name ?? ""}
        />
    )
}
