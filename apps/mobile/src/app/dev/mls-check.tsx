import { Redirect } from "expo-router"
import { lazy, Suspense } from "react"

// Metro folds `__DEV__` in a release bundle and drops the import: no screen, contract nor fixture there.
const MlsCheckPage = __DEV__
    ? lazy(() => import("@/presentation/pages/dev/mls-check/mls-check").then((page) => ({ default: page.MlsCheckPage })))
    : null

export default function MlsCheck() {
    if (!MlsCheckPage) return <Redirect href="/" />
    return (
        <Suspense fallback={null}>
            <MlsCheckPage />
        </Suspense>
    )
}
