import type { AvatarTone } from "@pinai/domain/models/avatar-tone"

/** The tone as a CSS colour, for surfaces that echo an avatar (a profile banner). */
export const TONE_FILL: Record<AvatarTone, string> = {
    acc: "var(--acc)",
    sec: "var(--sec)",
    violet: "oklch(0.70 0.085 300)",
    olive: "oklch(0.80 0.095 110)",
    neutral: "var(--surf3)",
    blue: "oklch(0.75 0.080 245)",
}

/** The colour that reads on `TONE_FILL`, as the Avatar's initials do. */
export const TONE_INK: Record<AvatarTone, string> = {
    acc: "var(--accink)",
    sec: "var(--secink)",
    violet: "oklch(0.18 0.02 300)",
    olive: "oklch(0.18 0.02 110)",
    neutral: "var(--foreground)",
    blue: "oklch(0.18 0.02 245)",
}
