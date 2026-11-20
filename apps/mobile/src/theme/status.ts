import type { UserStatus } from "@pinai/domain/models/presence"
import type { AppTheme } from "./unistyles"

/** A status's dot: invisible and offline wear the muted ink. */
export function statusColor(theme: AppTheme, status: UserStatus): string {
    switch (status) {
        case "online":
            return theme.colors.online
        case "idle":
            return theme.colors.idle
        case "dnd":
            return theme.colors.dnd
        case "invisible":
        case "offline":
            return theme.colors.mutedForeground
    }
}
