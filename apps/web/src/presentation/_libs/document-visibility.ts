import type { Visibility } from "@pinai/domain/usecases/e2ee/share-wait.usecase"

/** The page's visibility, as the domain's waits read it. */
export const documentVisibility: Visibility = {
    visible: () => !document.hidden,
    onChange: (listener) => {
        document.addEventListener("visibilitychange", listener)
        return () => document.removeEventListener("visibilitychange", listener)
    },
}
