import type { Pronouns } from "./auth"
import { nameLength, readableName } from "./name"

/** `GET /api/profiles?actor=`: what the IdP shows the viewer of an account. */
export interface ProfileCard {
    actor_uri: string
    display_name: string | null
    avatar_url: string | null
    pronouns: Pronouns | null
    bio: string | null
    /** RFC 3339: when the viewer and the account became friends; `null` unless they are. */
    friends_since: string | null
}

const PRONOUN_LABELS: Record<Pronouns, string> = {
    he: "he / him",
    she: "she / her",
    "non-binary": "non-binary",
}

export function pronounsLabel(pronouns: Pronouns | null): string | null {
    return pronouns ? PRONOUN_LABELS[pronouns] : null
}

/** The longest display name, in characters (code points) as the IdP counts them. */
export const MAX_DISPLAY_NAME_LENGTH = 50

/** The display name a profile save sends: the draft as the IdP takes it (`readableName`), or why it can't be. */
export function displayNameToSave(draft: string): { name: string } | { refused: "blank" | "too-long" } {
    const name = readableName(draft)
    if (name === null) return { refused: "blank" }
    return nameLength(name) > MAX_DISPLAY_NAME_LENGTH ? { refused: "too-long" } : { name }
}
