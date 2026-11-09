import type { IKeepRunningPort, KeepRunningSetting } from "@pinai/domain/ports/keep-running.port"

import type { DesktopBridge } from "./desktop-bridge"

/** {@link IKeepRunningPort} for the desktop renderer: the main process, deciding at each close, holds it. */
export class DesktopKeepRunningAdapter implements IKeepRunningPort {
    private readonly bridge: DesktopBridge

    constructor(bridge: DesktopBridge) {
        this.bridge = bridge
    }

    get(): Promise<KeepRunningSetting> {
        return this.bridge.window.keepRunning()
    }

    set(keepRunning: boolean): Promise<void> {
        return this.bridge.window.setKeepRunning(keepRunning)
    }
}
