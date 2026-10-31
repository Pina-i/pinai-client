import { readFileSync } from "fs"
import { writeFile } from "fs/promises"

import type { BrowserWindowConstructorOptions } from "electron"

import { MARK_LINES, MARK_RIPPLES, MARK_VIEW_BOX } from "./title-bar-mark"

/**
 * The title bar's height: the page draws its own bar over it (`TitleBar`), and the system's
 * buttons sit on its end — the window controls overlay.
 */
export const TITLE_BAR_HEIGHT = 32

/** The colours of the system's buttons, as hex: Electron parses no `oklch()`. */
export interface TitleBarColors {
    /** The bar behind the buttons — the page's `--background`. */
    background: string
    /** The glyphs — the page's `--muted-foreground`. */
    symbols: string
}

/** Black Pearl dark, `index.css`'s `:root`: what the window shows before the page says otherwise. */
export const DEFAULT_TITLE_BAR: TitleBarColors = { background: "#040c0c", symbols: "#869292" }

const HEX = /^#[0-9a-f]{6}$/i

/** The page's colours, or null for anything else: they reach the window as they are. */
export function titleBarColors(value: unknown): TitleBarColors | null {
    if (typeof value !== "object" || value === null) return null
    const { background, symbols } = value as Record<string, unknown>
    if (typeof background !== "string" || typeof symbols !== "string") return null
    return HEX.test(background) && HEX.test(symbols) ? { background, symbols } : null
}

/**
 * No system title bar: the page draws its own, and the system keeps its buttons — the traffic
 * lights on macOS, a window controls overlay elsewhere, coloured like the page. Kept over the IdP's
 * pages too, which load in the same window and draw no buttons.
 */
export function frameOptions(platform: NodeJS.Platform, colors: TitleBarColors): BrowserWindowConstructorOptions {
    const mac = platform === "darwin"
    return {
        titleBarStyle: "hidden",
        // On macOS, the overlay's CSS environment variables only: its buttons are the traffic lights.
        titleBarOverlay: mac
            ? { height: TITLE_BAR_HEIGHT }
            : { height: TITLE_BAR_HEIGHT, color: colors.background, symbolColor: colors.symbols },
        // Centred on the bar: the lights are 12px tall.
        ...(mac && { trafficLightPosition: { x: 14, y: (TITLE_BAR_HEIGHT - 12) / 2 } }),
        // Painted before the page, and wherever a resize uncovers the window.
        backgroundColor: colors.background,
    }
}

const mask = (paths: string[]) =>
    `url("data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${MARK_VIEW_BOX}'>${paths.map((d) => `<path d='${d}'/>`).join("")}</svg>`,
    )}")`

/**
 * The app's title bar (`apps/web/index.html`, `.pn-titlebar`) over the IdP's pages, which load in
 * the same window and draw none: the band and the name on `html::before`, the mark's line work and
 * ripples on two more pseudo-elements, as masks. The IdP's palettes are the app's, verbatim, so its
 * tokens colour it. Its pages fill `body`, which steps down by the bar.
 */
export const IDP_TITLE_BAR = `html::before {
    content: "Pīna'i";
    position: fixed;
    z-index: 2147483646;
    top: 0;
    left: 0;
    right: 0;
    height: env(titlebar-area-height, 0px);
    overflow: hidden;
    display: flex;
    align-items: center;
    padding-left: calc(env(titlebar-area-x, 0px) + 40px);
    background: var(--background);
    color: var(--foreground);
    font: 600 15px/1 "Instrument Serif", Georgia, serif;
    user-select: none;
    -webkit-app-region: drag;
}
html::after,
body::before {
    content: "";
    position: fixed;
    z-index: 2147483647;
    top: calc((env(titlebar-area-height, 0px) - 13px) / 2);
    left: calc(env(titlebar-area-x, 0px) + 14px);
    width: 18px;
    height: min(13px, env(titlebar-area-height, 0px));
    pointer-events: none;
    mask: ${mask(MARK_LINES)} center / contain no-repeat;
}
html::after {
    background: var(--foreground);
}
body::before {
    background: var(--acc);
    mask-image: ${mask(MARK_RIPPLES)};
}
body {
    padding-top: env(titlebar-area-height, 0px) !important;
}`

/**
 * The colours last painted, from `file`: a launch opens in the theme it closed in, not Black Pearl
 * until the page paints. The default when there are none, or none readable.
 */
export function readTitleBar(file: string): TitleBarColors {
    try {
        return titleBarColors(JSON.parse(readFileSync(file, "utf8"))) ?? DEFAULT_TITLE_BAR
    } catch {
        return DEFAULT_TITLE_BAR
    }
}

/** Keeps the colours for the next launch. A failed write only costs that launch its first frame. */
export async function saveTitleBar(file: string, colors: TitleBarColors): Promise<void> {
    try {
        await writeFile(file, JSON.stringify(colors))
    } catch {
        // Next launch opens in Black Pearl, then repaints.
    }
}
