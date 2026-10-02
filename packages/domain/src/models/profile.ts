import type { Pronouns } from "./auth"

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
