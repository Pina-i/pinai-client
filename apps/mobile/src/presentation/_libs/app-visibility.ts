import type { Visibility } from "@pinai/domain/usecases/e2ee/share-wait.usecase"
import { AppState } from "react-native"

/** The app in front, as the domain's waits read it. */
export const appVisibility: Visibility = {
    visible: () => AppState.currentState === "active",
    onChange: (listener) => {
        const subscription = AppState.addEventListener("change", () => listener())
        return () => subscription.remove()
    },
}
