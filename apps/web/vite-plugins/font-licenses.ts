import { readFileSync } from "fs"
import { createRequire } from "module"
import path from "path"

import type { Plugin } from "vite"

// The SIL OFL wants its text and the fonts' copyright notices with every copy of the fonts: each
// @fontsource dependency's LICENSE, so a font added to package.json can't ship without one.
export function fontLicenses(): Plugin {
    let root = ""
    return {
        name: "pinai:font-licenses",
        apply: "build",
        configResolved(config) {
            root = config.root
        },
        generateBundle() {
            const require = createRequire(path.join(root, "package.json"))
            const { dependencies = {} } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
                dependencies?: Record<string, string>
            }
            for (const name of Object.keys(dependencies).filter((name) => name.startsWith("@fontsource"))) {
                this.emitFile({
                    type: "asset",
                    fileName: `licenses/${name.slice(1).replace("/", "-")}.txt`,
                    source: readFileSync(require.resolve(`${name}/LICENSE`), "utf8"),
                })
            }
        },
    }
}
