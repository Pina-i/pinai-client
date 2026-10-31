import type { IWindowFramePort, TitleBarColors } from "@pinai/domain/ports/window-frame.port"

import type { DesktopBridge } from "./desktop-bridge"

/** {@link IWindowFramePort} for the desktop renderer: the main process colours the window's buttons. */
export class DesktopWindowFrameAdapter implements IWindowFramePort {
    private readonly bridge: DesktopBridge

    constructor(bridge: DesktopBridge) {
        this.bridge = bridge
    }

    paintTitleBar(colors: TitleBarColors): Promise<void> {
        return this.bridge.window.paintTitleBar(colors)
    }
}
