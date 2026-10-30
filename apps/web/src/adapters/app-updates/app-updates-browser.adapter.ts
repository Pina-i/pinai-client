import type { AppUpdate, IAppUpdatesPort } from "@pinai/domain/ports/app-updates.port"

/** {@link IAppUpdatesPort} for the browser: a reload is its update. */
export class BrowserAppUpdatesAdapter implements IAppUpdatesPort {
    async status(): Promise<AppUpdate> {
        return { kind: "none" }
    }

    onChange(): () => void {
        return () => {}
    }

    async restart(): Promise<void> {}

    async download(): Promise<void> {}
}
