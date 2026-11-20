/** The tones an avatar wears; each client paints them in its palette. */
export type AvatarTone = "acc" | "sec" | "violet" | "olive" | "neutral" | "blue"

// `sec` is left out: it is reserved for groups, so a person never reads as one.
const PERSON_TONES: AvatarTone[] = ["acc", "blue", "violet", "olive", "neutral"]

/** Stable tone for a person, so the same address wears the same colour everywhere, on every client. */
export function avatarToneFor(seed: string): AvatarTone {
    let hash = 0
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0
    return PERSON_TONES[Math.abs(hash) % PERSON_TONES.length]
}
