import type { GroupRole } from "./group"
import { actorUriToAddress, addressParts } from "./identity"

export type GroupEventKind = "created" | "added" | "removed" | "left" | "renamed" | "role_changed"

/**
 * A change to a group, as its conversation shows it between the messages: the shape the IdP
 * pushes as `group_event`. The names are the IdP's, as it names a message's sender.
 */
export interface GroupEvent {
    id: string
    conversationId: string
    event: GroupEventKind
    actorUri: string
    actorDisplayName: string | null
    /** Whom it is about: the one added, removed or given a role, or the one leaving. */
    subjectUri?: string
    subjectDisplayName?: string | null
    /** The new name, for `renamed`. */
    name?: string
    /** The new role, for `role_changed`. */
    role?: GroupRole
    /** ISO 8601 instant. */
    createdAt: string
}

/** The line a group's conversation shows for one of its changes, to the reader `me`. */
export function describeGroupEvent(event: GroupEvent, me: string): string {
    const byMe = event.actorUri === me
    const by = byMe ? "You" : nameOf(event.actorUri, event.actorDisplayName)
    const subject = event.subjectUri ?? event.actorUri
    const whom = subject === me ? "you" : nameOf(subject, event.subjectDisplayName ?? null)
    switch (event.event) {
        case "created":
            return `${by} created the group`
        case "added":
            return `${by} added ${whom}`
        case "removed":
            return `${by} removed ${whom}`
        case "left":
            return `${by} left`
        case "renamed":
            return `${by} renamed the group to “${event.name ?? ""}”`
        case "role_changed":
            if (event.role === "admin") return `${by} made ${whom} an admin`
            return subject === event.actorUri ? `${by} stepped down as admin` : `${by} removed ${whom} as admin`
    }
}

// The handle stands in only when the instance has no name for them.
function nameOf(actorUri: string, displayName: string | null): string {
    return displayName ?? addressParts(actorUriToAddress(actorUri)).handle
}
