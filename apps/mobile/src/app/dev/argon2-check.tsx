import { Redirect } from "expo-router"
import { lazy, Suspense } from "react"

// Metro folds `__DEV__` in a release bundle and drops the import: no screen nor known answers there.
const Argon2CheckPage = __DEV__
    ? lazy(() => import("@/presentation/pages/dev/argon2-check/argon2-check").then((page) => ({ default: page.Argon2CheckPage })))
    : null

export default function Argon2Check() {
    if (!Argon2CheckPage) return <Redirect href="/" />
    return (
        <Suspense fallback={null}>
            <Argon2CheckPage />
        </Suspense>
    )
}
