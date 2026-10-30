export const DESKTOP_PLATFORMS = ["macOS", "Windows", "Linux"] as const
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number]

export const DESKTOP_RELEASE_URL = "https://github.com/Pina-i/pinai-client/releases/latest"

/** Each platform's installer, under one name in every release (apps/desktop/electron-builder.yml). */
export const DESKTOP_DOWNLOADS: Record<DesktopPlatform, string> = {
    macOS: `${DESKTOP_RELEASE_URL}/download/Pinai.dmg`,
    Windows: `${DESKTOP_RELEASE_URL}/download/Pinai-Setup.exe`,
    Linux: `${DESKTOP_RELEASE_URL}/download/Pinai-x86_64.AppImage`,
}

/** `apps/desktop/package.json`'s version, put in at build time by `vite.config.ts`. */
export const DESKTOP_VERSION = (import.meta.env.PINAI_DESKTOP_VERSION as string | undefined) ?? ""

/** Set by `electron.vite.config.ts` on the desktop app's renderer: there is nothing to download there. */
export const IN_DESKTOP_APP = import.meta.env.PINAI_DESKTOP === true

/** A platform string — `userAgentData.platform`, `navigator.platform` or the user agent — as one of ours. */
export function desktopPlatformOf(hint: string): DesktopPlatform {
    if (/mac/i.test(hint)) return "macOS"
    if (/win/i.test(hint)) return "Windows"
    return "Linux"
}

export function currentDesktopPlatform(): DesktopPlatform {
    const nav = navigator as Navigator & { userAgentData?: { platform?: string } }
    return desktopPlatformOf(nav.userAgentData?.platform || nav.platform || nav.userAgent)
}
