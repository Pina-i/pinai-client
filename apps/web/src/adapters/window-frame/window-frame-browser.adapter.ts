import type { IWindowFramePort } from "@pinai/domain/ports/window-frame.port"

/** {@link IWindowFramePort} for the browser: the tab's frame is the browser's. */
export class BrowserWindowFrameAdapter implements IWindowFramePort {
    async paintTitleBar(): Promise<void> {}
}
