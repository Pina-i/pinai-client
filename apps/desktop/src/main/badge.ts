import { badgeLabel } from "@pinai/domain/models/attention"
import { type BrowserWindow, type WebContents, app, nativeImage } from "electron"

/** The most the icon counts: a larger count from the page shows as this. */
export const MAX_BADGE_COUNT = 9999

// The page draws a 32px disc, a kilobyte or two as a PNG.
const MAX_IMAGE_LENGTH = 16 * 1024
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/

export interface Badge {
    count: number
    /** Windows' overlay, drawn by the page as a PNG data URL; null when it has none. */
    image: string | null
}

export const NO_BADGE: Badge = { count: 0, image: null }

/** The page's badge, or null for anything else: a non-negative integer, capped, and a PNG or none. */
export function badgeOf(count: unknown, image: unknown): Badge | null {
    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) return null
    if (image !== null) {
        if (typeof image !== "string" || image.length > MAX_IMAGE_LENGTH || !PNG_DATA_URL.test(image)) return null
    }
    return { count: Math.min(count, MAX_BADGE_COUNT), image: count > 0 ? image : null }
}

export type BadgeAction =
    /** `app.setBadgeCount`: the Dock's badge; on Linux, the LauncherEntry signal docks and taskbars read. */
    | { kind: "count"; count: number }
    /** The overlay on the taskbar button, `image` null clearing it. */
    | { kind: "overlay"; image: string | null; description: string }
    | { kind: "none" }

export function badgeAction(platform: NodeJS.Platform, badge: Badge): BadgeAction {
    switch (platform) {
        case "darwin":
        case "linux":
            return { kind: "count", count: badge.count }
        case "win32": {
            const label = badgeLabel(badge.count)
            return label && badge.image
                ? { kind: "overlay", image: badge.image, description: `${label} unread` }
                : { kind: "overlay", image: null, description: "" }
        }
        default:
            return { kind: "none" }
    }
}

export interface BadgeSurface {
    setBadgeCount(count: number): void
    setOverlayIcon(image: string | null, description: string): void
}

/** Electron's: the app's badge count, and the overlay of the window `current` gives. */
export function electronBadgeSurface(current: () => BrowserWindow | null): BadgeSurface {
    return {
        setBadgeCount: (count) => void app.setBadgeCount(count),
        setOverlayIcon: (image, description) => {
            const icon = image === null ? null : nativeImage.createFromDataURL(image)
            current()?.setOverlayIcon(icon && !icon.isEmpty() ? icon : null, description)
        },
    }
}

/** The badge on the app's icon: shown when it changes, cleared when the page that set it goes. */
export class AppBadge {
    private readonly platform: NodeJS.Platform
    private readonly surface: BadgeSurface
    private shown: Badge = NO_BADGE

    constructor(platform: NodeJS.Platform, surface: BadgeSurface) {
        this.platform = platform
        this.surface = surface
    }

    show(badge: Badge): void {
        if (badge.count === this.shown.count && badge.image === this.shown.image) return
        this.shown = badge
        const action = badgeAction(this.platform, badge)
        try {
            if (action.kind === "count") this.surface.setBadgeCount(action.count)
            else if (action.kind === "overlay") this.surface.setOverlayIcon(action.image, action.description)
        } catch {
            // A badge is a convenience: a system without one, or a window gone, must not reach the app.
        }
    }

    clear(): void {
        this.show(NO_BADGE)
    }
}

/** The page that set the badge is gone after a new load or a crash; the app's next page sets it again. */
export function clearWhenPageGoes(contents: WebContents, badge: AppBadge): void {
    contents.on("did-navigate", () => badge.clear())
    contents.on("render-process-gone", () => badge.clear())
}
