import type { GateRoute } from "@pinai/domain/models/admission"

export const GATE_PAGES = {
    app: "/home",
    setup: "/onboarding/recovery-setup",
    "new-device": "/onboarding/recovery-restore",
    reset: "/onboarding/history-reset",
} as const satisfies Record<GateRoute, string>
