export type PresenceState = "online" | "away" | "offline"

/** Snapshot entry returned by GET /api/presence. */
export interface PresenceSnapshotEntry {
    actorUri: string
    state: PresenceState
}

/** Server → client presence update event (over WebSocket). */
export interface PresenceUpdatePayload {
    actorUri: string
    state: PresenceState
    timestamp: string
}

/** Server → client typing event (over WebSocket). */
export interface TypingEventPayload {
    actorUri: string
    conversationId: string
    timestamp: string
}

/**
 * Maps a server-side `PresenceState` to the UI's `UserStatus` palette.
 * The UI status enum has no `"away"` variant — we render it as `"idle"`.
 */
export function presenceToUserStatus(state: PresenceState | undefined): "online" | "idle" | "offline" {
    if (state === "online") return "online"
    if (state === "away") return "idle"
    return "offline"
}

/**
 * Human-readable label for a UI `UserStatus`.
 * Used wherever presence is shown as text (friend list subtitle, conversation
 * header, etc.). Centralised so the wording stays consistent.
 */
export function userStatusLabel(status: "online" | "idle" | "dnd" | "invisible" | "offline"): string {
    switch (status) {
        case "online":
            return "Online"
        case "idle":
            return "Away"
        case "dnd":
            return "Busy"
        case "invisible":
            return "Invisible"
        case "offline":
            return "Offline"
    }
}
