import { Redirect } from "expo-router"
import { lazy, Suspense } from "react"

// Metro folds `__DEV__` in a release bundle and drops the import: no screen nor restart state there.
const StorageRestartPage = __DEV__
    ? lazy(() => import("@/presentation/pages/dev/storage-restart/storage-restart").then((page) => ({ default: page.StorageRestartPage })))
    : null

export default function StorageRestart() {
    if (!StorageRestartPage) return <Redirect href="/" />
    return (
        <Suspense fallback={null}>
            <StorageRestartPage />
        </Suspense>
    )
}
