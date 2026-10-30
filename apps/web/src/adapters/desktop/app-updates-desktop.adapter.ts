import type { AppUpdate, IAppUpdatesPort } from "@pinai/domain/ports/app-updates.port"

import type { DesktopBridge } from "./desktop-bridge"

/** {@link IAppUpdatesPort} for the desktop renderer: the main process checks, downloads and installs. */
export class DesktopAppUpdatesAdapter implements IAppUpdatesPort {
    private readonly bridge: DesktopBridge

    constructor(bridge: DesktopBridge) {
        this.bridge = bridge
    }

    status(): Promise<AppUpdate> {
        return this.bridge.updates.status()
    }

    onChange(listener: (update: AppUpdate) => void): () => void {
        return this.bridge.updates.onChange(listener)
    }

    restart(): Promise<void> {
        return this.bridge.updates.restart()
    }

    download(): Promise<void> {
        return this.bridge.updates.download()
    }
}
