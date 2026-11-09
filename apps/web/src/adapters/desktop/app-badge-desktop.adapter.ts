import type { IAppBadgePort } from "@pinai/domain/ports/app-badge.port"

import { drawBadge } from "./badge-image"
import type { DesktopBridge } from "./desktop-bridge"

/** {@link IAppBadgePort} for the desktop renderer: Windows' overlay needs a picture, so it is drawn here. */
export class DesktopAppBadgeAdapter implements IAppBadgePort {
    private readonly bridge: DesktopBridge
    private readonly draw: (count: number) => string | null

    constructor(bridge: DesktopBridge, draw: (count: number) => string | null = drawBadge) {
        this.bridge = bridge
        this.draw = draw
    }

    setCount(count: number): Promise<void> {
        return this.bridge.window.setBadge(count, this.draw(count))
    }
}
