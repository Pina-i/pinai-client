import type { IAppBadgePort } from "@pinai/domain/ports/app-badge.port"

/** {@link IAppBadgePort} for the browser: the tab's title carries the count, the icon is the browser's. */
export class BrowserAppBadgeAdapter implements IAppBadgePort {
    async setCount(): Promise<void> {}
}
