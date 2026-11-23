import { Redirect } from "expo-router"
import { lazy, Suspense } from "react"

// Metro folds `__DEV__` in a release bundle and drops the import: no screen, contract nor check stores there.
const StorageCheckPage = __DEV__
    ? lazy(() => import("@/presentation/pages/dev/storage-check/storage-check").then((page) => ({ default: page.StorageCheckPage })))
    : null

export default function StorageCheck() {
    if (!StorageCheckPage) return <Redirect href="/" />
    return (
        <Suspense fallback={null}>
            <StorageCheckPage />
        </Suspense>
    )
}
