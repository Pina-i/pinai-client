import { createHash } from "crypto"

import type { Plugin } from "vite"

// Every script without src, attributes or not: one with src is the app's own file, which 'self' covers.
const INLINE_SCRIPT = /<script\b(?![^>]*\ssrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi
const CHARSET = /<meta charset="[^"]*"\s*\/?>/i
// A local instance (`make alice`); every other one, attachment URLs and Klipy are https.
const LOOPBACK = ["http://localhost:*", "http://127.0.0.1:*"]
const LOOPBACK_SOCKETS = ["ws://localhost:*", "ws://127.0.0.1:*"]

/** `html` with its Content-Security-Policy, its inline scripts allowed by their sha256. */
export function withContentSecurityPolicy(html: string): string {
    if (!CHARSET.test(html)) throw new Error("index.html has no <meta charset> for the CSP to follow")
    const hashes = [...html.matchAll(INLINE_SCRIPT)].map(
        ([, script]) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`,
    )
    const policy = [
        "default-src 'self'",
        ["script-src 'self' 'wasm-unsafe-eval'", ...hashes].join(" "),
        // The splash's style attributes, and the <style> elements sonner and react-aria insert at run time: CSS can't run code.
        "style-src 'self' 'unsafe-inline'",
        "font-src 'self'",
        ["img-src 'self' data: blob: https:", ...LOOPBACK].join(" "),
        ["media-src 'self' blob: https:", ...LOOPBACK].join(" "),
        ["connect-src 'self' https: wss:", ...LOOPBACK, ...LOOPBACK_SOCKETS].join(" "),
        "worker-src 'self'",
        "frame-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
    ].join("; ")
    return html.replace(CHARSET, (charset) => `${charset}\n        <meta http-equiv="Content-Security-Policy" content="${policy}" />`)
}

/** The built app's CSP, the web's and the desktop's alike; the dev server's own scripts are inline. */
export function contentSecurityPolicy(): Plugin {
    return {
        name: "pinai:content-security-policy",
        apply: "build",
        transformIndexHtml: { order: "post", handler: withContentSecurityPolicy },
    }
}
