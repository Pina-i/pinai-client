/** Each "Download for …" link names the installer the desktop build makes, in the latest release. */
import { readFileSync } from "fs"
import path from "path"

import { describe, expect, it } from "vitest"

import { DESKTOP_DOWNLOADS, DESKTOP_RELEASE_URL } from "@/presentation/_libs/client-download"

const config = readFileSync(path.resolve(import.meta.dirname, "../../desktop/electron-builder.yml"), "utf8")

/** `<section>.artifactName` in electron-builder.yml. */
function artifactName(section: string): string {
    const block = new RegExp(`^${section}:\\n((?: {2}.*\\n)+)`, "m").exec(config)?.[1] ?? ""
    const name = /^ {2}artifactName: (.+)$/m.exec(block)?.[1]
    if (!name) throw new Error(`no ${section}.artifactName in electron-builder.yml`)
    return name
}

const fileOf = (url: string) => url.slice(url.lastIndexOf("/") + 1)

describe("DESKTOP_DOWNLOADS", () => {
    it("links each platform to its installer's name in every release", () => {
        expect(fileOf(DESKTOP_DOWNLOADS.Windows)).toBe(artifactName("nsis").replace("${ext}", "exe"))
        expect(fileOf(DESKTOP_DOWNLOADS.macOS)).toBe(artifactName("dmg").replace("${ext}", "dmg"))
        expect(fileOf(DESKTOP_DOWNLOADS.Linux)).toBe(
            artifactName("linux").replace("${arch}", "x86_64").replace("${ext}", "AppImage"),
        )
    })

    it("takes them from the latest release", () => {
        for (const url of Object.values(DESKTOP_DOWNLOADS)) {
            expect(url).toMatch(/^https:\/\/github\.com\/Pina-i\/pinai-client\/releases\/latest\/download\/[^/]+$/)
        }
    })

    it("sends everything else to the release page", () => {
        expect(DESKTOP_RELEASE_URL).toBe("https://github.com/Pina-i/pinai-client/releases/latest")
    })
})
