/**
 * Coarse browser+OS label mirroring the IdP's server-side UA parser.
 * Decorative — never used as an identifier. Returns "Web client" when
 * nothing matches.
 */
export function userAgentLabel(): string {
    if (typeof navigator === "undefined") return "Web client"
    const ua = navigator.userAgent
    if (!ua) return "Web client"

    const os = ua.includes("Mac OS X") || ua.includes("macOS")
        ? "macOS"
        : ua.includes("Windows")
          ? "Windows"
          : ua.includes("Android")
            ? "Android"
            : ua.includes("iPhone")
              ? "iOS"
              : ua.includes("iPad")
                ? "iPadOS"
                : ua.includes("Linux")
                  ? "Linux"
                  : "this device"

    const browser = ua.includes("Edg/") || ua.includes("Edge/")
        ? "Edge"
        : ua.includes("OPR/") || ua.includes("Opera/")
          ? "Opera"
          : ua.includes("Firefox/")
            ? "Firefox"
            : ua.includes("Chrome/")
              ? "Chrome"
              : ua.includes("Safari/")
                ? "Safari"
                : "Web"

    return `${browser} on ${os}`
}
