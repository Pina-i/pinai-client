/** Closing the window: hidden while the app keeps running, gone once quitting, and what brings it back. */
import { EventEmitter } from "events"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "fs"
import os from "os"
import path from "path"

import { describe, expect, it, vi } from "vitest"

import {
    AppLifecycle,
    CRASH_RELOAD_SPACING_MS,
    KeepRunningChoice,
    appMenu,
    closeAction,
    comesBackBy,
    hideWindow,
    keepRunningByDefault,
    keepRunningOf,
    quitsWithoutWindows,
    readKeepRunning,
    reloadsAfterCrash,
    saveKeepRunning,
    showApp,
    showForSignIn,
} from "../src/main/keep-running"

function file(): string {
    return path.join(mkdtempSync(path.join(os.tmpdir(), "pinai-keep-running-")), "keep-running.json")
}

describe("closeAction", () => {
    it.each([
        [true, false, "hide"],
        [true, true, "close"],
        [false, false, "close"],
        [false, true, "close"],
    ] as const)("kept running %s, quitting %s: %s", (keepRunning, quitting, action) => {
        expect(closeAction(keepRunning, quitting)).toBe(action)
    })
})

describe("quitsWithoutWindows", () => {
    it("quits on Windows and Linux; macOS stays in the Dock", () => {
        expect(quitsWithoutWindows("win32")).toBe(true)
        expect(quitsWithoutWindows("linux")).toBe(true)
        expect(quitsWithoutWindows("darwin")).toBe(false)
    })
})

describe("the default, by desktop", () => {
    it.each([["GNOME"], ["ubuntu:GNOME"], ["GNOME-Classic:GNOME"]])("is off on %s, which shows no tray icon by itself", (desktop) => {
        expect(keepRunningByDefault(desktop)).toBe(false)
        expect(comesBackBy("linux", desktop)).toBe("launch")
    })

    it.each([["KDE"], ["XFCE"], [""], [undefined]])("is on elsewhere: %s", (desktop) => {
        expect(keepRunningByDefault(desktop)).toBe(true)
        expect(comesBackBy("linux", desktop)).toBe("tray")
    })

    it("brings the window back by the tray on Windows, the Dock on macOS", () => {
        expect(comesBackBy("win32", undefined)).toBe("tray")
        expect(comesBackBy("darwin", undefined)).toBe("dock")
    })
})

describe("the choice kept across launches", () => {
    it("is the default without a file", () => {
        expect(readKeepRunning(file(), true)).toBe(true)
        expect(readKeepRunning(file(), false)).toBe(false)
    })

    it("reads back what was saved, over either default", () => {
        const kept = file()
        expect(saveKeepRunning(kept, false)).toBe(true)
        expect(JSON.parse(readFileSync(kept, "utf8"))).toEqual({ keepRunning: false })
        expect(readKeepRunning(kept, true)).toBe(false)
        saveKeepRunning(kept, true)
        expect(readKeepRunning(kept, false)).toBe(true)
    })

    it("replaces the file whole, leaving nothing aside", () => {
        const kept = file()
        saveKeepRunning(kept, true)
        saveKeepRunning(kept, false)
        expect(readFileSync(kept, "utf8")).toBe('{"keepRunning":false}')
        expect(existsSync(`${kept}.tmp`)).toBe(false)
    })

    it.each([["{not json"], ["null"], ["5"], [JSON.stringify({ keepRunning: "false" })], [JSON.stringify({})]])(
        "falls back to the default from a file it can't trust: %s",
        (content) => {
            const kept = file()
            writeFileSync(kept, content)
            expect(readKeepRunning(kept, true)).toBe(true)
            expect(readKeepRunning(kept, false)).toBe(false)
        },
    )

    it("says when a write failed", () => {
        expect(saveKeepRunning(path.join(file(), "missing", "keep-running.json"), false)).toBe(false)
    })
})

describe("KeepRunningChoice", () => {
    it("starts from the file, else the default", () => {
        const kept = file()
        expect(new KeepRunningChoice(kept, false).current).toBe(false)
        saveKeepRunning(kept, true)
        expect(new KeepRunningChoice(kept, false).current).toBe(true)
    })

    it("keeps a new choice, and says whether it changed anything", () => {
        const kept = file()
        const choice = new KeepRunningChoice(kept, true)

        expect(choice.choose(true)).toBe(false)
        expect(choice.choose(false)).toBe(true)

        expect(choice.current).toBe(false)
        expect(readKeepRunning(kept, true)).toBe(false)
    })

    it.each([["true"], [0], [1], [null], [undefined], [{}]])("refuses %s", (value) => {
        const choice = new KeepRunningChoice(file(), true)
        expect(() => choice.choose(value)).toThrow("Not a keep-running choice")
        expect(choice.current).toBe(true)
    })

    it("answers a write that failed with an error, and keeps the choice it had", () => {
        const choice = new KeepRunningChoice(path.join(file(), "missing", "keep-running.json"), true)

        expect(() => choice.choose(false)).toThrow("couldn't be saved")
        expect(choice.current).toBe(true)
    })
})

describe("keepRunningOf", () => {
    it("takes a boolean, nothing else", () => {
        expect(keepRunningOf(true)).toBe(true)
        expect(keepRunningOf(false)).toBe(false)
        expect(keepRunningOf("true")).toBeNull()
        expect(keepRunningOf(0)).toBeNull()
    })
})

describe("reloadsAfterCrash", () => {
    const now = 10 * CRASH_RELOAD_SPACING_MS

    it.each([["crashed"], ["oom"], ["killed"], ["abnormal-exit"], ["launch-failed"]])("reloads after %s", (reason) => {
        expect(reloadsAfterCrash(reason, null, now)).toBe(true)
    })

    it("leaves a clean exit", () => {
        expect(reloadsAfterCrash("clean-exit", null, now)).toBe(false)
    })

    it("reloads once a minute at most, so a crash loop doesn't spin", () => {
        expect(reloadsAfterCrash("crashed", now - CRASH_RELOAD_SPACING_MS + 1, now)).toBe(false)
        expect(reloadsAfterCrash("crashed", now - CRASH_RELOAD_SPACING_MS, now)).toBe(true)
    })
})

function appWindow({ minimized = false, visible = true, fullScreen = false } = {}) {
    const calls: unknown[][] = []
    const window = Object.assign(new EventEmitter(), {
        calls,
        isMinimized: () => minimized,
        isVisible: () => visible,
        isFullScreen: () => fullScreen,
        restore: () => void calls.push(["restore"]),
        show: () => void calls.push(["show"]),
        showInactive: () => void calls.push(["showInactive"]),
        focus: () => void calls.push(["focus"]),
        hide: () => void calls.push(["hide"]),
        setFullScreen: (on: boolean) => void calls.push(["setFullScreen", on]),
    })
    return window
}

describe("showApp: the tray's click, the Dock's, a second launch", () => {
    it("shows the hidden window and focuses it", () => {
        const window = appWindow({ visible: false })
        const open = vi.fn()

        showApp(window, false, open)

        expect(window.calls).toEqual([["show"], ["focus"]])
        expect(open).not.toHaveBeenCalled()
    })

    it("restores a minimised one first", () => {
        const window = appWindow({ minimized: true })
        showApp(window, false, () => {})
        expect(window.calls).toEqual([["restore"], ["show"], ["focus"]])
    })

    it("opens a new window where there is none: macOS after a close", () => {
        const open = vi.fn()
        showApp(null, false, open)
        expect(open).toHaveBeenCalledOnce()
    })

    it("still shows the window once quitting, as a cancelled quit would leave it; only a new one waits", () => {
        const window = appWindow({ visible: false })
        const open = vi.fn()

        showApp(window, true, open)
        showApp(null, true, open)

        expect(window.calls).toEqual([["show"], ["focus"]])
        expect(open).not.toHaveBeenCalled()
    })
})

describe("showForSignIn", () => {
    it("shows a hidden window without taking the focus", () => {
        const window = appWindow({ visible: false })
        showForSignIn(window)
        expect(window.calls).toEqual([["showInactive"]])
    })

    it("leaves a visible one as it is", () => {
        const window = appWindow({ visible: true })
        showForSignIn(window)
        expect(window.calls).toEqual([])
    })
})

describe("hideWindow", () => {
    it("hides it", () => {
        const window = appWindow()
        hideWindow(window, "darwin")
        expect(window.calls).toEqual([["hide"]])
    })

    it("leaves a macOS full screen first, which would stay black", () => {
        const window = appWindow({ fullScreen: true })

        hideWindow(window, "darwin")
        expect(window.calls).toEqual([["setFullScreen", false]])
        window.emit("leave-full-screen")

        expect(window.calls).toEqual([["setFullScreen", false], ["hide"]])
    })

    it("hides a full screen in place elsewhere", () => {
        const window = appWindow({ fullScreen: true })
        hideWindow(window, "linux")
        expect(window.calls).toEqual([["hide"]])
    })
})

describe("AppLifecycle", () => {
    function lifecycle({ keepRunning = true, window = appWindow() as ReturnType<typeof appWindow> | null } = {}) {
        const app = new EventEmitter()
        const updater = new EventEmitter()
        const tray = { setShown: vi.fn() }
        const badge = { clear: vi.fn() }
        const open = vi.fn()
        const life = new AppLifecycle(app, updater, {
            platform: "linux",
            keepRunning: () => keepRunning,
            window: () => window,
            open,
            tray,
            badge,
        })
        const close = () => {
            const event = { preventDefault: vi.fn() }
            life.close(event)
            return event.preventDefault.mock.calls.length > 0 ? "hidden" : "let go"
        }
        return { app, updater, tray, badge, open, window, close }
    }

    it("hides the window on close while the app keeps running", () => {
        const { window, close } = lifecycle()

        expect(close()).toBe("hidden")
        expect(window?.calls).toEqual([["hide"]])
    })

    it("lets it go when the app doesn't keep running", () => {
        expect(lifecycle({ keepRunning: false }).close()).toBe("let go")
    })

    it.each([["before-quit"], ["before-quit-for-update"]])("lets it go once %s said a quit is under way", (event) => {
        const { app, updater, window, close } = lifecycle()

        ;(event === "before-quit" ? app : updater).emit(event)

        expect(close()).toBe("let go")
        expect(window?.calls).toEqual([])
    })

    it("takes the tray away and clears the badge at will-quit", () => {
        const { app, tray, badge } = lifecycle()

        app.emit("will-quit")

        expect(tray.setShown).toHaveBeenCalledWith(false)
        expect(badge.clear).toHaveBeenCalledOnce()
    })

    it("shows the window on a second launch", () => {
        const { app, window } = lifecycle()

        app.emit("second-instance", {}, ["pinai"], "/")

        expect(window?.calls).toEqual([["show"], ["focus"]])
    })

    it("opens one on a second launch where there is none, unless quitting", () => {
        const fresh = lifecycle({ window: null })
        fresh.app.emit("second-instance")
        expect(fresh.open).toHaveBeenCalledOnce()

        const quitting = lifecycle({ window: null })
        quitting.app.emit("before-quit")
        quitting.app.emit("second-instance")
        expect(quitting.open).not.toHaveBeenCalled()
    })
})

describe("appMenu", () => {
    it("gives Quit Ctrl+Q on Windows and Linux, in the menu the window never shows", () => {
        for (const platform of ["win32", "linux"] as const) {
            expect(appMenu(platform)).toEqual([
                { role: "fileMenu", submenu: [{ role: "quit", accelerator: "CommandOrControl+Q" }] },
                { role: "editMenu" },
                { role: "viewMenu" },
                { role: "windowMenu" },
            ])
        }
    })

    it("is Electron's own on macOS, ⌘Q in the app menu", () => {
        expect(appMenu("darwin")).toEqual([
            { role: "appMenu" },
            { role: "fileMenu" },
            { role: "editMenu" },
            { role: "viewMenu" },
            { role: "windowMenu" },
        ])
    })
})
