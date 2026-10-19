// The splash is static markup in index.html, outside React: it is the first
// paint of every page load and hides whatever React mounts beneath it. Screens
// that are still loading hold it; the last release fades it out.

const SPLASH_ID = "pn-splash"
// Read by index.html to resume the loop after a redirect instead of restarting.
const PHASE_KEY = "pn-splash-t0"
// Once the app is up, a hold shorter than this (a warm gate probe) never brings it back.
const SHOW_DELAY_MS = 150
const MIN_SHOWN_MS = 600
// The opacity transition on `.pn-splash`.
const FADE_MS = 400

type SplashState = "shown" | "leaving" | "hidden"

let holds = 0
let state: SplashState = "shown"
// The boot splash has been up since navigation start, which is performance.now()'s origin.
let shownAt = 0
let timer: ReturnType<typeof setTimeout> | undefined
let frame: number | undefined

function cancelPending() {
    clearTimeout(timer)
    timer = undefined
    if (frame !== undefined) cancelAnimationFrame(frame)
    frame = undefined
}

function writePhase(startedAt: number | null) {
    try {
        if (startedAt === null) sessionStorage.removeItem(PHASE_KEY)
        else sessionStorage.setItem(PHASE_KEY, String(startedAt))
    } catch {
        // Storage can be unavailable; the loop then restarts on the next page.
    }
}

function show(el: HTMLElement) {
    el.style.setProperty("--pn-splash-at", "0ms")
    el.dataset.state = "entering"
    el.hidden = false
    // Commit the transparent frame, or the fade-in has nothing to start from.
    void el.offsetWidth
    delete el.dataset.state
    state = "shown"
    shownAt = performance.now()
    writePhase(Date.now())
}

function hide(el: HTMLElement) {
    state = "leaving"
    el.dataset.state = "leaving"
    timer = setTimeout(() => {
        timer = undefined
        el.hidden = true
        delete el.dataset.state
        state = "hidden"
        writePhase(null)
    }, FADE_MS)
}

function settle(el: HTMLElement) {
    cancelPending()
    if (state !== "shown") return
    // Two frames: a hold taken by the very next render still counts, and the
    // page beneath has painted before the fade uncovers it.
    frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
            frame = undefined
            const wait = Math.max(0, shownAt + MIN_SHOWN_MS - performance.now())
            timer = setTimeout(() => {
                timer = undefined
                hide(el)
            }, wait)
        })
    })
}

export interface SplashHoldOptions {
    // How a hold taken after boot brings the splash back: after a short delay,
    // or never, which only keeps a splash that is fully up.
    reshow?: "delayed" | "never"
}

export function holdSplashScreen({ reshow = "delayed" }: SplashHoldOptions = {}): () => void {
    const el = document.getElementById(SPLASH_ID)
    if (!el) return () => undefined
    if (reshow === "never" && state !== "shown") return () => undefined

    holds += 1
    if (state === "hidden") {
        timer ??= setTimeout(() => {
            timer = undefined
            show(el)
        }, SHOW_DELAY_MS)
    } else {
        cancelPending()
        if (state === "leaving") {
            delete el.dataset.state
            state = "shown"
        }
    }

    let released = false
    return () => {
        if (released) return
        released = true
        holds -= 1
        if (holds === 0) settle(el)
    }
}
