/**
 * The AppImage's menu entry: written once, kept in step when the file moves, and never forced
 * on a user who removed it or on a `pinai.desktop` that isn't ours.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "fs"
import os from "os"
import path from "path"

import { describe, expect, it } from "vitest"

import { desktopEntry, syncMenuEntry } from "../src/main/menu-entry"

function temp(): string {
    return mkdtempSync(path.join(os.tmpdir(), "pinai-menu-"))
}

function place(appImage = "/opt/apps/Pinai-x86_64.AppImage") {
    const root = temp()
    const appDir = path.join(root, "mount")
    for (const size of ["256x256", "512x512"]) {
        const dir = path.join(appDir, "usr/share/icons/hicolor", size, "apps")
        mkdirSync(dir, { recursive: true })
        writeFileSync(path.join(dir, "pinai.png"), `icon-${size}`)
    }
    const dataHome = path.join(root, "data")
    return {
        appImage,
        appDir,
        dataHome,
        marker: path.join(root, "userData", "menu-entry"),
        entry: path.join(dataHome, "applications", "pinai.desktop"),
        icon: (size: string) => path.join(dataHome, "icons/hicolor", size, "apps/pinai.png"),
    }
}

describe("desktopEntry", () => {
    it("is the entry for a simple path", () => {
        expect(desktopEntry("/opt/Pinai.AppImage")).toBe(
            [
                "[Desktop Entry]",
                "Type=Application",
                "Name=Pinai",
                "Comment=The Pīna'i desktop client",
                'Exec="/opt/Pinai.AppImage" %U',
                "TryExec=/opt/Pinai.AppImage",
                "Icon=pinai",
                "Terminal=false",
                "Categories=Network;",
                "StartupWMClass=pinai",
                "X-Pinai-AppImage=true",
                "",
            ].join("\n"),
        )
    })

    it("quotes the path in Exec and leaves it raw in TryExec when it has spaces", () => {
        const text = desktopEntry("/home/a b/My Apps/Pinai.AppImage")
        expect(text).toContain('Exec="/home/a b/My Apps/Pinai.AppImage" %U\n')
        expect(text).toContain("TryExec=/home/a b/My Apps/Pinai.AppImage\n")
    })
})

describe("syncMenuEntry", () => {
    it("writes the entry, the icons and the marker on a first launch", async () => {
        const p = place()
        await syncMenuEntry(p)
        expect(readFileSync(p.entry, "utf8")).toBe(desktopEntry(p.appImage))
        expect(readFileSync(p.icon("256x256"), "utf8")).toBe("icon-256x256")
        expect(readFileSync(p.icon("512x512"), "utf8")).toBe("icon-512x512")
        expect(readFileSync(p.marker, "utf8")).toBe(p.appImage)
    })

    it("rewrites nothing on a second launch from the same path", async () => {
        const p = place()
        await syncMenuEntry(p)
        const before = { text: readFileSync(p.entry, "utf8"), mtime: statSync(p.entry).mtimeMs }
        await new Promise((resolve) => setTimeout(resolve, 20))
        await syncMenuEntry(p)
        expect(readFileSync(p.entry, "utf8")).toBe(before.text)
        expect(statSync(p.entry).mtimeMs).toBe(before.mtime)
    })

    it("rewrites the path of a moved AppImage and keeps what the menu editor added", async () => {
        const p = place()
        await syncMenuEntry(p)
        writeFileSync(p.entry, `${readFileSync(p.entry, "utf8")}NoDisplay=true\n`)
        await syncMenuEntry({ ...p, appImage: "/home/me/Pinai.AppImage" })
        const text = readFileSync(p.entry, "utf8")
        expect(text).toBe(`${desktopEntry("/home/me/Pinai.AppImage")}NoDisplay=true\n`)
        expect(readFileSync(p.marker, "utf8")).toBe("/home/me/Pinai.AppImage")
    })

    it("does not recreate an entry the user removed", async () => {
        const p = place()
        await syncMenuEntry(p)
        rmSync(p.entry)
        await syncMenuEntry(p)
        await syncMenuEntry({ ...p, appImage: "/home/me/Pinai.AppImage" })
        expect(existsSync(p.entry)).toBe(false)
    })

    it("leaves a pinai.desktop that isn't ours alone", async () => {
        const p = place()
        mkdirSync(path.dirname(p.entry), { recursive: true })
        writeFileSync(p.entry, "[Desktop Entry]\nName=Someone else's\n")
        await syncMenuEntry(p)
        expect(readFileSync(p.entry, "utf8")).toBe("[Desktop Entry]\nName=Someone else's\n")
        expect(existsSync(p.marker)).toBe(false)
        expect(existsSync(p.icon("256x256"))).toBe(false)
    })

    it("does nothing from an extracted AppImage", async () => {
        const p = place()
        await syncMenuEntry({ ...p, appImage: path.join(p.appDir, "AppRun") })
        expect(existsSync(p.entry)).toBe(false)
        expect(existsSync(p.marker)).toBe(false)
    })

    it("does nothing for a relative path", async () => {
        const p = place("Pinai.AppImage")
        await syncMenuEntry(p)
        expect(existsSync(p.entry)).toBe(false)
    })

    it.each([
        ["a double quote", 'a"b'],
        ["a backtick", "a`b"],
        ["a dollar", "a$b"],
        ["a backslash", "a\\b"],
        ["a percent", "a%b"],
        ["a newline", "a\nb"],
        ["a tab", "a\tb"],
        ["a NUL", "a\u0000b"],
        ["a DEL", "a\u007fb"],
    ])("does nothing for a path with %s", async (_name, part) => {
        const p = place(`/opt/${part}/Pinai.AppImage`)
        await syncMenuEntry(p)
        expect(existsSync(p.entry)).toBe(false)
        expect(existsSync(p.marker)).toBe(false)
    })

    it("does not throw when the data folder can't be written", async () => {
        const p = place()
        writeFileSync(p.dataHome, "a file where a folder should be")
        await expect(syncMenuEntry(p)).resolves.toBeUndefined()
        expect(existsSync(p.marker)).toBe(false)
    })

    it("does not throw when the AppImage has no icons", async () => {
        const p = place()
        rmSync(path.join(p.appDir, "usr"), { recursive: true })
        await expect(syncMenuEntry(p)).resolves.toBeUndefined()
    })
})
