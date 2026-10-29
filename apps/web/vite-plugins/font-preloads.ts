import { realpathSync } from "fs"
import path from "path"

import { normalizePath, type Plugin } from "vite"

const PRELOAD = /href="\/node_modules\/([^"]+\.woff2)"/g

// index.html names its font preloads under /node_modules/. A build bundles them, and must leave
// none behind: production would answer one with index.html. Dev serves the CSS's url()s at the
// packages' real paths (pnpm links node_modules), so a preload must name that path, or the face
// loads twice.
export function fontPreloads(): Plugin {
    let root = ""
    let serving = false
    return {
        name: "pinai:font-preloads",
        configResolved(config) {
            root = config.root
            serving = config.command === "serve"
        },
        transformIndexHtml: {
            order: "post",
            handler(html) {
                if (serving) {
                    return html.replace(PRELOAD, (_, file: string) => {
                        const real = normalizePath(realpathSync(path.join(root, "node_modules", file)))
                        return `href="/@fs/${real.replace(/^\//, "")}"`
                    })
                }
                const left = html.match(PRELOAD)
                if (left) throw new Error(`index.html preloads fonts the build didn't bundle: ${left.join(", ")}`)
                return html
            },
        },
    }
}
