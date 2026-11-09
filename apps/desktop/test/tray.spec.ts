/** The tray's icon: what it shows for the attention count, its menu, and when it is there at all. */
import { describe, expect, it, vi } from "vitest"

const electron = vi.hoisted(() => {
    class FakeTray {
        static made: FakeTray[] = []
        readonly events = new Map<string, () => void>()
        image: unknown
        tooltip = ""
        menu: unknown = null
        destroyed = false
        constructor(image: unknown) {
            this.image = image
            FakeTray.made.push(this)
        }
        setImage(image: unknown) {
            this.image = image
        }
        setToolTip(tooltip: string) {
            this.tooltip = tooltip
        }
        setContextMenu(menu: unknown) {
            this.menu = menu
        }
        on(event: string, listener: () => void) {
            this.events.set(event, listener)
        }
        destroy() {
            this.destroyed = true
        }
    }
    return {
        FakeTray,
        createFromPath: (file: string) => ({ file }),
        buildFromTemplate: (template: unknown[]) => ({ template }),
    }
})
vi.mock("electron", () => ({
    Tray: electron.FakeTray,
    Menu: { buildFromTemplate: electron.buildFromTemplate },
    nativeImage: { createFromPath: electron.createFromPath },
}))

const { APP_TITLE } = await import("@pinai/domain/models/attention")
const { AppTray, electronTrayHost, showsTray, trayImages, trayLook, trayMenu } = await import("../src/main/tray")
type TrayHost = import("../src/main/tray").TrayHost
type TrayLook = import("../src/main/tray").TrayLook

const IMAGES = { plain: "/app/tray.png", dot: "/app/tray-dot.png" }

describe("trayLook", () => {
    it.each([
        [0, "plain", "Pīna'i"],
        [1, "dot", "Pīna'i (1)"],
        [120, "dot", "Pīna'i (120)"],
    ])("for %i: the %s icon, \"%s\"", (count, icon, tooltip) => {
        expect(trayLook(count)).toEqual({ icon, tooltip })
    })
})

describe("trayMenu", () => {
    it("shows the window or quits, whatever the count", () => {
        const actions = { show: vi.fn(), quit: vi.fn() }
        const menu = trayMenu(actions)

        expect(menu.map((item) => item.label ?? item.type)).toEqual([`Show ${APP_TITLE}`, "separator", "Quit"])
        menu[0].click?.({} as never, undefined, {} as never)
        expect(actions.show).toHaveBeenCalledOnce()
        menu[2].click?.({} as never, undefined, {} as never)
        expect(actions.quit).toHaveBeenCalledOnce()
    })
})

describe("showsTray", () => {
    it("is there on Windows and Linux while the app keeps running; never on macOS", () => {
        expect(showsTray("win32", true)).toBe(true)
        expect(showsTray("linux", true)).toBe(true)
        expect(showsTray("linux", false)).toBe(false)
        expect(showsTray("darwin", true)).toBe(false)
    })
})

describe("trayImages", () => {
    it("is the .ico on Windows, the PNG elsewhere", () => {
        const ico = { plain: "tray.ico", dot: "tray-dot.ico" }
        const png = { plain: "tray.png", dot: "tray-dot.png" }

        expect(trayImages("win32", { ico, png })).toBe(ico)
        expect(trayImages("linux", { ico, png })).toBe(png)
    })
})

function host(): TrayHost & { calls: unknown[][] } {
    const calls: unknown[][] = []
    return {
        calls,
        add: (look: TrayLook) => void calls.push(["add", look]),
        update: (look: TrayLook) => void calls.push(["update", look]),
        remove: () => void calls.push(["remove"]),
    }
}

describe("AppTray", () => {
    const actions = { show: () => {}, quit: () => {} }

    it("adds the icon with the count it already heard, follows it, and goes", () => {
        const tray = host()
        const icon = new AppTray(tray, actions)

        icon.setCount(3)
        icon.setShown(true)
        icon.setCount(3)
        icon.setCount(0)
        icon.setShown(false)
        icon.setShown(false)

        expect(tray.calls).toEqual([
            ["add", { icon: "dot", tooltip: "Pīna'i (3)" }],
            ["update", { icon: "plain", tooltip: "Pīna'i" }],
            ["remove"],
        ])
    })

    it("only counts while the icon isn't shown", () => {
        const tray = host()
        const icon = new AppTray(tray, actions)

        icon.setCount(5)

        expect(tray.calls).toEqual([])
    })

    it("never throws: a desktop without a tray stays the tray's problem", () => {
        const icon = new AppTray(
            {
                add: () => {
                    throw new Error("no tray host")
                },
                update: () => {},
                remove: () => {},
            },
            actions,
        )

        expect(() => icon.setShown(true)).not.toThrow()
    })
})

describe("electronTrayHost", () => {
    it("puts the icon in the tray: tooltip, menu, a click that shows the window", () => {
        const actions = { show: vi.fn(), quit: vi.fn() }
        electronTrayHost(IMAGES).add({ icon: "dot", tooltip: "Pīna'i (2)" }, actions)
        const tray = electron.FakeTray.made.at(-1)!

        expect(tray.image).toEqual({ file: "/app/tray-dot.png" })
        expect(tray.tooltip).toBe("Pīna'i (2)")
        expect(tray.menu).toEqual({ template: expect.arrayContaining([expect.objectContaining({ label: "Quit" })]) })
        tray.events.get("click")?.()
        expect(actions.show).toHaveBeenCalledOnce()
    })

    it("changes the picture only when the icon does, and destroys the tray", () => {
        const surface = electronTrayHost(IMAGES)
        surface.add({ icon: "plain", tooltip: "Pīna'i" }, { show: () => {}, quit: () => {} })
        const tray = electron.FakeTray.made.at(-1)!
        const setImage = vi.spyOn(tray, "setImage")

        surface.update({ icon: "dot", tooltip: "Pīna'i (1)" })
        surface.update({ icon: "dot", tooltip: "Pīna'i (2)" })
        surface.remove()
        surface.update({ icon: "plain", tooltip: "Pīna'i" })

        expect(setImage.mock.calls).toEqual([[{ file: "/app/tray-dot.png" }]])
        expect(tray.tooltip).toBe("Pīna'i (2)")
        expect(tray.destroyed).toBe(true)
    })
})
