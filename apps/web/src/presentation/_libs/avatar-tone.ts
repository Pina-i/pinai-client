export type AvatarTone = "acc" | "sec" | "violet" | "olive" | "neutral" | "blue"

// `sec` is left out: it is reserved for groups, so a person never reads as one.
const PERSON_TONES: AvatarTone[] = ["acc", "blue", "violet", "olive", "neutral"]

/** Stable tone for a person, so the same address wears the same colour everywhere. */
export function avatarToneFor(seed: string): AvatarTone {
    let hash = 0
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
    return PERSON_TONES[Math.abs(hash) % PERSON_TONES.length]
}

/** The tone as a CSS colour, for surfaces that echo an avatar (a profile banner). */
export const TONE_FILL: Record<AvatarTone, string> = {
    acc: "var(--acc)",
    sec: "var(--sec)",
    violet: "oklch(0.70 0.085 300)",
    olive: "oklch(0.80 0.095 110)",
    neutral: "var(--surf3)",
    blue: "oklch(0.75 0.080 245)",
}
