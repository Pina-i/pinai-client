import { APP_TITLE, titleWithCount } from "@pinai/domain/models/attention"
import { type MenuItemConstructorOptions, type NativeImage, Menu, Tray, nativeImage } from "electron"

export type TrayIcon = "plain" | "dot"

export type TrayImages = Record<TrayIcon, string>

export interface TrayLook {
    icon: TrayIcon
    /** As the window's title: "Pīna'i (N)". */
    tooltip: string
}

export function trayLook(count: number): TrayLook {
    return { icon: count > 0 ? "dot" : "plain", tooltip: titleWithCount(APP_TITLE, count) }
}

/** macOS keeps a running app in the Dock: no menu-bar icon there. */
export function showsTray(platform: NodeJS.Platform, keepRunning: boolean): boolean {
    return keepRunning && platform !== "darwin"
}

/** Windows picks the .ico's size for its DPI; Electron hands Linux's panel the PNG, which it scales. */
export function trayImages(platform: NodeJS.Platform, files: { ico: TrayImages; png: TrayImages }): TrayImages {
    return platform === "win32" ? files.ico : files.png
}

export interface TrayActions {
    show(): void
    quit(): void
}

export function trayMenu(actions: TrayActions): MenuItemConstructorOptions[] {
    return [
        { label: `Show ${APP_TITLE}`, click: () => actions.show() },
        { type: "separator" },
        { label: "Quit", click: () => actions.quit() },
    ]
}

/** The system's tray: one icon at most. */
export interface TrayHost {
    add(look: TrayLook, actions: TrayActions): void
    update(look: TrayLook): void
    remove(): void
}

/** The app's icon in the tray, while it is wanted, showing the badge's count. */
export class AppTray {
    private readonly host: TrayHost
    private readonly actions: TrayActions
    private count = 0
    private shown = false

    constructor(host: TrayHost, actions: TrayActions) {
        this.host = host
        this.actions = actions
    }

    setShown(shown: boolean): void {
        if (shown === this.shown) return
        this.shown = shown
        this.apply(() => (shown ? this.host.add(trayLook(this.count), this.actions) : this.host.remove()))
    }

    setCount(count: number): void {
        if (count === this.count) return
        this.count = count
        if (this.shown) this.apply(() => this.host.update(trayLook(count)))
    }

    private apply(change: () => void): void {
        try {
            change()
        } catch {
            // A desktop without a tray must not reach the app: a second launch still brings the window back.
        }
    }
}

/** Electron's tray: its left click shows the window, its right click the menu. */
export function electronTrayHost(images: TrayImages): TrayHost {
    const pictures = new Map<TrayIcon, NativeImage>()
    const picture = (icon: TrayIcon) => {
        let image = pictures.get(icon)
        if (!image) pictures.set(icon, (image = nativeImage.createFromPath(images[icon])))
        return image
    }
    let tray: Tray | null = null
    let icon: TrayIcon | null = null
    return {
        add(look, actions) {
            tray = new Tray(picture(look.icon))
            icon = look.icon
            tray.setToolTip(look.tooltip)
            tray.setContextMenu(Menu.buildFromTemplate(trayMenu(actions)))
            tray.on("click", () => actions.show())
        },
        update(look) {
            if (!tray) return
            if (look.icon !== icon) tray.setImage(picture(look.icon))
            icon = look.icon
            tray.setToolTip(look.tooltip)
        },
        remove() {
            tray?.destroy()
            tray = null
            icon = null
        },
    }
}
