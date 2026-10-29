import { createHash } from "crypto"

import { describe, expect, it } from "vitest"

import { withContentSecurityPolicy } from "../vite-plugins/content-security-policy"

const sha256 = (script: string) => `'sha256-${createHash("sha256").update(script).digest("base64")}'`

const THEME = '\n            document.documentElement.dataset.theme = "pearl-dark"\n        '
const SPLASH = '\n            document.documentElement.dataset.splash = "shell"\n        '
const HTML = `<!doctype html>
<html lang="en">
    <head>
        <meta charset="UTF-8" />
        <script>${THEME}</script>
        <script type="module" crossorigin src="/assets/index-abc.js"></script>
    </head>
    <body>
        <script>${SPLASH}</script>
        <script src="/config.js"></script>
    </body>
</html>`

function policyOf(html: string): Map<string, string[]> {
    const content = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1]
    if (content === undefined) throw new Error("no Content-Security-Policy")
    return new Map(
        content.split("; ").map((directive) => {
            const [name, ...values] = directive.split(" ")
            return [name, values]
        }),
    )
}

describe("withContentSecurityPolicy", () => {
    it("allows the app's own scripts, its inline ones by their hash, and WASM", () => {
        expect(policyOf(withContentSecurityPolicy(HTML)).get("script-src")).toEqual([
            "'self'",
            "'wasm-unsafe-eval'",
            sha256(THEME),
            sha256(SPLASH),
        ])
    })

    it("hashes every inline script, whatever its attributes, and no external one", () => {
        const MODULE = '\n            import "/x.js"\n        '
        const html = withContentSecurityPolicy(HTML.replace("</head>", `    <SCRIPT type="module">${MODULE}</SCRIPT>\n    </head>`))
        expect(policyOf(html).get("script-src")).toEqual([
            "'self'",
            "'wasm-unsafe-eval'",
            sha256(THEME),
            sha256(MODULE),
            sha256(SPLASH),
        ])
    })

    it("hashes an inline script as the browser parses it, its CRLF line breaks as LF", () => {
        const html = withContentSecurityPolicy(HTML.replaceAll("\n", "\r\n"))
        expect(policyOf(html).get("script-src")).toEqual(["'self'", "'wasm-unsafe-eval'", sha256(THEME), sha256(SPLASH)])
    })

    it("comes right after the charset, before any script", () => {
        const html = withContentSecurityPolicy(HTML)
        const policy = html.indexOf('http-equiv="Content-Security-Policy"')
        expect(policy).toBeGreaterThan(html.indexOf("<meta charset"))
        expect(policy).toBeLessThan(html.indexOf("<script"))
    })

    it("keeps fonts, frames and plugins to the app, and talks to any instance", () => {
        const policy = policyOf(withContentSecurityPolicy(HTML))
        expect(policy.get("default-src")).toEqual(["'self'"])
        expect(policy.get("font-src")).toEqual(["'self'"])
        expect(policy.get("frame-src")).toEqual(["'none'"])
        expect(policy.get("object-src")).toEqual(["'none'"])
        expect(policy.get("base-uri")).toEqual(["'none'"])
        expect(policy.get("form-action")).toEqual(["'none'"])
        expect(policy.get("worker-src")).toEqual(["'self'"])
        expect(policy.get("connect-src")).toEqual(expect.arrayContaining(["'self'", "https:", "wss:", "ws://localhost:*"]))
    })

    it("refuses a document without a charset to follow", () => {
        expect(() => withContentSecurityPolicy("<html><head></head></html>")).toThrow(/charset/)
    })
})
