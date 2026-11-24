import { AwaitedShare, type AwaitedShareState, type ShareAcceptance } from "./accept-history-share.usecase"

/** Whether the app is in front, and word when that changes: a page's visibility, an app's state. */
export interface Visibility {
    visible(): boolean
    onChange(listener: () => void): () => void
}

export interface ShareWaitDeps {
    /** The page's or the app's one guarded accept (`acceptHistoryShareUseCase`). */
    accept: () => Promise<ShareAcceptance | null>
    visibility: Visibility
    signInAgainOnDeviceMismatch: (error: unknown) => Promise<boolean>
    warn?: (what: string, error: unknown) => void
    onState: (state: AwaitedShareState) => void
    onKept: () => void
}

/**
 * A device without the words reading its key share (`AwaitedShare`) on the entry's backoff, none while the app
 * isn't in front, at once when it comes back. `device_mismatch` ending the wait signs in again; any other end is
 * warned of.
 */
export class ShareWait {
    private readonly deps: ShareWaitDeps
    private readonly awaited: AwaitedShare
    private timer: ReturnType<typeof setTimeout> | undefined
    private live = false
    private readonly stops: (() => void)[] = []

    constructor(deps: ShareWaitDeps) {
        this.deps = deps
        this.awaited = new AwaitedShare(deps.accept, deps.warn)
    }

    start(): void {
        if (this.live) return
        this.live = true
        this.stops.push(this.awaited.onChange(() => this.changed()))
        this.stops.push(
            this.deps.visibility.onChange(() => {
                if (this.deps.visibility.visible()) this.tick()
            })
        )
        this.tick()
    }

    stop(): void {
        this.live = false
        clearTimeout(this.timer)
        for (const stop of this.stops.splice(0)) stop()
    }

    /** The device was just approved here: the share is likelier now, the backoff starts over. */
    again(): void {
        void this.awaited.again()
    }

    private changed(): void {
        const state = this.awaited.state
        this.deps.onState(state)
        if (state.kind === "kept") this.deps.onKept()
        if (state.kind === "ended") {
            void this.deps.signInAgainOnDeviceMismatch(state.error).then((signingIn) => {
                if (!signingIn) this.deps.warn?.("reading the history key share", state.error)
            })
        }
    }

    private tick(): void {
        clearTimeout(this.timer)
        if (!this.live || !this.deps.visibility.visible()) return
        void this.awaited.tick().then(() => {
            if (this.live && this.awaited.state.kind === "waiting") this.timer = setTimeout(() => this.tick(), this.awaited.nextDelay())
        })
    }
}
