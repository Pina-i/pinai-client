import { createFileRoute, redirect } from "@tanstack/react-router"

import { E2eeDebugPage } from "@/presentation/pages/e2ee-debug/E2eeDebugPage"

/**
 * `/settings/e2ee-debug` — DEV-only panel. Production builds redirect
 * to home so the page never ships in a deployed bundle.
 *
 * The check runs in `beforeLoad` so the build-time tree-shaker can
 * still see the import; the redirect is the runtime gate.
 * `import.meta.env.DEV` is `true` only under `vite dev` /
 * `vite preview --mode development`.
 */
export const Route = createFileRoute("/_authenticated/settings/e2ee-debug")({
    beforeLoad: () => {
        if (!import.meta.env.DEV) {
            throw redirect({ to: "/home" })
        }
    },
    component: E2eeDebugPage,
})
