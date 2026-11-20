import type { UserStatus } from "@pinai/domain/models/presence"

/** The statuses one picks, in the prototype's words. */
export const STATUS_CHOICES: { status: UserStatus; label: string; note: string }[] = [
    { status: "online", label: "Online", note: "Seen by everyone" },
    { status: "idle", label: "Idle", note: "Away from the keyboard" },
    { status: "dnd", label: "Do not disturb", note: "No notifications at all" },
    { status: "invisible", label: "Invisible", note: "You appear offline" },
]

export function statusWords(status: UserStatus): string {
    return STATUS_CHOICES.find((choice) => choice.status === status)?.label ?? "Offline"
}
