/** The installed app's updates: downloaded and installed on a restart, or, on an unsigned Mac, pointed at. */
import { EventEmitter } from "events"

import { readFileSync } from "fs"
import path from "path"

import type { AppUpdater, UpdateCheckResult } from "electron-updater"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppUpdates, CHECK_EVERY_MS, MAC_DOWNLOAD_URL, type AppUpdate } from "../src/main/updates"

class FakeUpdater extends EventEmitter {
    autoDownload = true
    autoInstallOnAppQuit = true
    checkForUpdates = vi.fn(async (): Promise<UpdateCheckResult | null> => null)
    quitAndInstall = vi.fn()
}

function setUp(canInstall: boolean, updater = new FakeUpdater()) {
    const notified: AppUpdate[] = []
    const openExternal = vi.fn(async () => {})
    const updates = new AppUpdates(updater as unknown as AppUpdater, {
        canInstall,
        openExternal,
        notify: (update) => void notified.push(update),
    })
    updates.start()
    return { updater, updates, notified, openExternal }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("AppUpdates, on Windows and Linux", () => {
    it("downloads what it finds, then offers the restart that installs it", () => {
        const { updater, updates, notified } = setUp(true)
        expect(updater.autoDownload).toBe(true)
        expect(updater.autoInstallOnAppQuit).toBe(true)

        updater.emit("update-available", { version: "0.2.0" })
        expect(updates.current()).toEqual({ kind: "none" })
        updater.emit("update-downloaded", { version: "0.2.0" })

        expect(notified).toEqual([{ kind: "ready", version: "0.2.0" }])
        expect(updates.current()).toEqual({ kind: "ready", version: "0.2.0" })
        updates.restart()
        expect(updater.quitAndInstall).toHaveBeenCalledOnce()
    })

    it("restarts nothing before an update is ready", () => {
        const { updater, updates } = setUp(true)
        updates.restart()
        expect(updater.quitAndInstall).not.toHaveBeenCalled()
    })
})

describe("AppUpdates, on an unsigned Mac", () => {
    it("downloads nothing, and sends to the release's dmg", async () => {
        const { updater, updates, notified, openExternal } = setUp(false)
        expect(updater.autoDownload).toBe(false)
        expect(updater.autoInstallOnAppQuit).toBe(false)

        updater.emit("update-available", { version: "0.2.0" })

        expect(notified).toEqual([{ kind: "available", version: "0.2.0" }])
        await updates.download()
        expect(openExternal).toHaveBeenCalledWith(MAC_DOWNLOAD_URL)
        updates.restart()
        expect(updater.quitAndInstall).not.toHaveBeenCalled()
    })

    it("points at the name electron-builder gives the dmg", () => {
        const yml = readFileSync(path.resolve(import.meta.dirname, "../electron-builder.yml"), "utf8")
        const name = /^dmg:\n(?:[ \t]+.*\n)*?[ \t]+artifactName:\s*(\S+)/m.exec(yml)?.[1]?.replace("${ext}", "dmg")
        expect(name).toBeTruthy()
        expect(MAC_DOWNLOAD_URL.endsWith(`/releases/latest/download/${name}`)).toBe(true)
    })
})

describe("AppUpdates' checks", () => {
    it("checks at once, then every 6 hours", () => {
        const { updater } = setUp(true)
        expect(updater.checkForUpdates).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(CHECK_EVERY_MS)
        expect(updater.checkForUpdates).toHaveBeenCalledTimes(2)
    })

    it("keeps quiet when offline or GitHub is down", async () => {
        const updater = new FakeUpdater()
        updater.checkForUpdates.mockRejectedValue(new Error("net::ERR_INTERNET_DISCONNECTED"))
        const { notified } = setUp(true, updater)

        await vi.runOnlyPendingTimersAsync()
        expect(notified).toEqual([])
    })

    it("keeps quiet when a download fails", async () => {
        const updater = new FakeUpdater()
        const downloadPromise = Promise.reject(new Error("net::ERR_CONNECTION_RESET"))
        updater.checkForUpdates.mockResolvedValue({ downloadPromise } as unknown as UpdateCheckResult)
        const { notified } = setUp(true, updater)

        await vi.runOnlyPendingTimersAsync()
        expect(notified).toEqual([])
    })
})
