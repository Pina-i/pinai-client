/**
 * What this device says it is — the `label` of `POST /api/keys/devices` and `/api/keys/packages`
 * (`identity-provider/specs/e2ee.md`): composed here from what the platform tells, so the IdP keeps
 * no platform's quirks.
 */

import type { DeviceClient, DeviceKind } from "./device"
import { cutName, readableName } from "./name"

export interface DeviceLabel {
    name: string
    kind: DeviceKind
    client: Exclude<DeviceClient, "unknown">
}

/** Chromium's client hints (`navigator.userAgentData`); `model` and `platformVersion` empty where the platform has none. */
export interface ChromiumHints {
    mobile: boolean
    model: string
    platformVersion: string
}

/** A browser's facts: its `User-Agent`, and Chromium's hints unless refused, late or absent. */
export interface BrowserFacts {
    client: "browser"
    userAgent: string
    hints: ChromiumHints | null
}

export type DesktopOs = "macOS" | "Windows" | "Linux"

/** What the desktop app's main process reads of the computer it runs on; null for what it couldn't. */
export interface ComputerFacts {
    os: DesktopOs
    model: string | null
    computerName: string | null
}

/** The desktop app's facts: the computer's. */
export interface AppFacts extends ComputerFacts {
    client: "app"
}

/** What a device's label is composed from, one kind of client a branch. */
export type DeviceFacts = BrowserFacts | AppFacts

/** The IdP's limit on an automatic name, in characters (code points). */
export const DEVICE_NAME_MAX_CHARS = 100

/** `raw` as the IdP takes a device's name, or null when nothing readable is left; joiners stay, emoji need them. */
export function deviceName(raw: string): string | null {
    const kept = readableName(raw)
    return kept === null ? null : readableName(cutName(kept, DEVICE_NAME_MAX_CHARS))
}

const UNKNOWN_NAME = "Web client"

export function composeDeviceLabel(facts: DeviceFacts): DeviceLabel {
    switch (facts.client) {
        case "browser":
            return browserLabel(facts)
        case "app":
            return appLabel(facts)
    }
}

/** The desktop system a `User-Agent` names, for what the app knows before its main process answers. */
export function desktopOsOf(userAgent: string): DesktopOs {
    const system = desktopSystem(userAgent)
    return system === "macOS" || system === "Windows" ? system : "Linux"
}

// No words for the kind of device: the card's icon says it.
function appLabel({ os, model, computerName }: AppFacts): DeviceLabel {
    const named = model === null ? null : readableName(model)
    const computer = computerName === null ? null : readableName(computerName)
    const shown = named ?? os
    let name = shown
    if (computer !== null && named !== null && holdsWords(computer, named)) {
        name = shortened(computer, DEVICE_NAME_MAX_CHARS)
    } else if (computer !== null) {
        const room = DEVICE_NAME_MAX_CHARS - Array.from(shown).length - " ()".length
        if (room >= 2) name = `${shown} (${shortened(computer, room)})`
    }
    return { name: deviceName(name) ?? os, kind: "laptop", client: "app" }
}

const LETTER_OR_DIGIT = "[\\p{L}\\p{N}]"

// Whole words only: "iMac" is in "Bob's iMac", not in "jimac-server".
function holdsWords(text: string, words: string): boolean {
    const escaped = words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return new RegExp(`(?<!${LETTER_OR_DIGIT})${escaped}(?!${LETTER_OR_DIGIT})`, "iu").test(text)
}

function shortened(text: string, max: number): string {
    const chars = Array.from(text)
    return chars.length <= max ? text : `${chars.slice(0, max - 1).join("").trimEnd()}…`
}

// Most specific first: every iOS browser says Safari, Edge and Opera say Chrome, Chrome says Safari.
const BROWSERS: [token: string, browser: string][] = [
    ["CriOS/", "Chrome"],
    ["FxiOS/", "Firefox"],
    ["EdgiOS/", "Edge"],
    ["EdgA/", "Edge"],
    ["Edg/", "Edge"],
    ["Edge/", "Edge"],
    ["OPR/", "Opera"],
    ["Opera/", "Opera"],
    ["Firefox/", "Firefox"],
    ["Chrome/", "Chrome"],
    ["Safari/", "Safari"],
]

interface Platform {
    system: string
    kind: DeviceKind
}

function browserLabel({ userAgent: ua, hints }: BrowserFacts): DeviceLabel {
    const unknown: DeviceLabel = { name: UNKNOWN_NAME, kind: "unknown", client: "browser" }
    const platform = platformOf(ua)
    const browser = BROWSERS.find(([token]) => ua.includes(token))?.[1]
    if (!browser && platform.kind === "laptop") return unknown
    const { system, kind } = hints ? refined(platform, hints) : platform
    return { name: deviceName(`${browser ?? "Browser"} on ${system}`) ?? UNKNOWN_NAME, kind, client: "browser" }
}

// Mobile first: an iPhone's `User-Agent` is "like Mac OS X".
function platformOf(ua: string): Platform {
    if (ua.includes("iPhone")) return { system: "iOS", kind: "phone" }
    // An iPad's Safari asks for the desktop site unless told not to: it says it is a Mac, and reads as one.
    if (ua.includes("iPad")) return { system: "iPadOS", kind: "tablet" }
    if (ua.includes("Android")) return { system: "Android", kind: ua.includes("Mobile") ? "phone" : "tablet" }
    return { system: desktopSystem(ua), kind: "laptop" }
}

function desktopSystem(ua: string): string {
    if (ua.includes("Mac OS X") || ua.includes("macOS")) return "macOS"
    if (ua.includes("Windows")) return "Windows"
    if (ua.includes("CrOS")) return "ChromeOS"
    if (ua.includes("Linux")) return "Linux"
    return "this device"
}

function refined(platform: Platform, hints: ChromiumHints): Platform {
    if (platform.system === "Android") {
        const model = deviceName(hints.model)
        // No table of Samsung's codes to marketing names: the brand says enough, and renaming does the rest.
        const system = model === null ? platform.system : model.startsWith("SM-") ? `Samsung ${model}` : model
        return { system, kind: hints.mobile ? "phone" : "tablet" }
    }
    if (platform.system === "Windows") return { ...platform, system: windowsName(hints.platformVersion) }
    return platform
}

// Chromium's `User-Agent` says "Windows NT 10.0" on 11 too; the platform version tells them apart.
function windowsName(platformVersion: string): string {
    const major = Number.parseInt(platformVersion.split(".")[0], 10)
    if (major >= 13) return "Windows 11"
    if (major >= 1) return "Windows 10"
    return "Windows"
}
