/**
 * The label a browser names itself by (`composeDeviceLabel`): its `User-Agent`'s "<browser> on
 * <system>", refined by Chromium's hints, and sanitized as the IdP takes a name.
 */
import { describe, expect, it, vi } from "vitest"

import {
    composeDeviceLabel,
    desktopOsOf,
    deviceName,
    type ChromiumHints,
    type DeviceFacts,
    type DeviceLabel,
} from "@pinai/domain/models/device-label"
import type { GatheredFacts, IDeviceFactsPort } from "@pinai/domain/ports/device-facts.port"
import { thisDeviceLabel } from "@pinai/domain/usecases/e2ee/this-device-label.usecase"

const UA = {
    chromeWindows:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    chromeAndroidPhone:
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
    chromeAndroidTablet:
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    edgeAndroid:
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.0.0",
    safariIphone:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    chromeIphone:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
    firefoxIphone:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
    safariIpad:
        "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    edgeWindows:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    operaMac:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/116.0.0.0",
    firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0",
    safariMac:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
    chromeMac:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    chromeLinux:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    chromeOs:
        "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
}

function browser(userAgent: string, hints: Partial<ChromiumHints> | null = null): DeviceFacts {
    return {
        client: "browser",
        userAgent,
        hints: hints && { mobile: false, model: "", platformVersion: "", ...hints },
    }
}

const label = (name: string, kind: DeviceLabel["kind"]): DeviceLabel => ({ name, kind, client: "browser" })

const ZWSP = String.fromCodePoint(0x200b)
const RTL_OVERRIDE = String.fromCodePoint(0x202e)
const BOM = String.fromCodePoint(0xfeff)
const LINE_SEPARATOR = String.fromCodePoint(0x2028)
const ZWJ = String.fromCodePoint(0x200d)
const TECHNOLOGIST = String.fromCodePoint(0x1f469, 0x200d, 0x1f4bb)

describe("composeDeviceLabel — the User-Agent alone", () => {
    it.each([
        ["Chrome on Windows", UA.chromeWindows, label("Chrome on Windows", "laptop")],
        ["an Android phone", UA.chromeAndroidPhone, label("Chrome on Android", "phone")],
        ["an Android tablet: no Mobile", UA.chromeAndroidTablet, label("Chrome on Android", "tablet")],
        ["Edge on Android, which says Chrome", UA.edgeAndroid, label("Edge on Android", "phone")],
        ["Safari on an iPhone", UA.safariIphone, label("Safari on iOS", "phone")],
        ["Chrome on an iPhone, which says Safari", UA.chromeIphone, label("Chrome on iOS", "phone")],
        ["Firefox on an iPhone, which says Safari", UA.firefoxIphone, label("Firefox on iOS", "phone")],
        ["Safari on an iPad", UA.safariIpad, label("Safari on iPadOS", "tablet")],
        ["Edge, which says Chrome", UA.edgeWindows, label("Edge on Windows", "laptop")],
        ["Opera, which says Chrome", UA.operaMac, label("Opera on macOS", "laptop")],
        ["Firefox on Linux", UA.firefoxLinux, label("Firefox on Linux", "laptop")],
        ["Safari on macOS", UA.safariMac, label("Safari on macOS", "laptop")],
        ["Chrome on ChromeOS", UA.chromeOs, label("Chrome on ChromeOS", "laptop")],
    ])("%s", (_case, userAgent, expected) => {
        expect(composeDeviceLabel(browser(userAgent))).toEqual(expected)
    })

    it("names what it can't read a web client, of no kind", () => {
        expect(composeDeviceLabel(browser("curl/8.5.0"))).toEqual(label("Web client", "unknown"))
        expect(composeDeviceLabel(browser(""))).toEqual(label("Web client", "unknown"))
    })

    it("names a phone's unknown browser by its system", () => {
        expect(composeDeviceLabel(browser("Mozilla/5.0 (Linux; Android 14) Mobile"))).toEqual(label("Browser on Android", "phone"))
    })
})

describe("composeDeviceLabel — Chromium's hints", () => {
    it("tells Windows 11 from 10 by the platform version", () => {
        expect(composeDeviceLabel(browser(UA.chromeWindows, { platformVersion: "15.0.0" }))).toEqual(
            label("Chrome on Windows 11", "laptop"),
        )
        expect(composeDeviceLabel(browser(UA.chromeWindows, { platformVersion: "13.0.0" })).name).toBe("Chrome on Windows 11")
        expect(composeDeviceLabel(browser(UA.chromeWindows, { platformVersion: "10.0.0" }))).toEqual(
            label("Chrome on Windows 10", "laptop"),
        )
        expect(composeDeviceLabel(browser(UA.chromeWindows, { platformVersion: "1.0.0" })).name).toBe("Chrome on Windows 10")
        expect(composeDeviceLabel(browser(UA.edgeWindows, { platformVersion: "15.0.0" })).name).toBe("Edge on Windows 11")
    })

    it("says only Windows before 10, or without a version", () => {
        expect(composeDeviceLabel(browser(UA.chromeWindows, { platformVersion: "0.3.0" })).name).toBe("Chrome on Windows")
        expect(composeDeviceLabel(browser(UA.chromeWindows, { platformVersion: "" })).name).toBe("Chrome on Windows")
    })

    it("puts an Android phone's model in the system's place", () => {
        expect(composeDeviceLabel(browser(UA.chromeAndroidPhone, { model: "Pixel 8", mobile: true }))).toEqual(
            label("Chrome on Pixel 8", "phone"),
        )
    })

    it("gives a Samsung code its brand", () => {
        expect(composeDeviceLabel(browser(UA.chromeAndroidPhone, { model: "SM-S921B", mobile: true }))).toEqual(
            label("Chrome on Samsung SM-S921B", "phone"),
        )
    })

    it("takes an Android tablet's kind from the hints", () => {
        expect(composeDeviceLabel(browser(UA.chromeAndroidTablet, { model: "SM-X710", mobile: false }))).toEqual(
            label("Chrome on Samsung SM-X710", "tablet"),
        )
        expect(composeDeviceLabel(browser(UA.chromeAndroidTablet, { model: "", mobile: false }))).toEqual(
            label("Chrome on Android", "tablet"),
        )
    })

    it("leaves macOS, Linux and ChromeOS as the User-Agent says", () => {
        const hints = { model: "", platformVersion: "15.1.0" }
        expect(composeDeviceLabel(browser(UA.chromeMac, hints))).toEqual(label("Chrome on macOS", "laptop"))
        expect(composeDeviceLabel(browser(UA.chromeLinux, hints))).toEqual(label("Chrome on Linux", "laptop"))
        expect(composeDeviceLabel(browser(UA.chromeOs, hints))).toEqual(label("Chrome on ChromeOS", "laptop"))
    })
})

describe("composeDeviceLabel — the name as the IdP takes it", () => {
    it("drops invisible and control characters from a model", () => {
        const model = `${RTL_OVERRIDE}Pixel${ZWSP} 8${BOM}${LINE_SEPARATOR}${String.fromCodePoint(9)}`
        expect(composeDeviceLabel(browser(UA.chromeAndroidPhone, { model, mobile: true })).name).toBe("Chrome on Pixel 8")
    })

    it("falls back to the system for a model with nothing readable", () => {
        const model = `${ZWSP}${ZWJ} ${BOM}`
        expect(composeDeviceLabel(browser(UA.chromeAndroidPhone, { model, mobile: true })).name).toBe("Chrome on Android")
    })

    it("cuts the name at 100 characters", () => {
        const name = composeDeviceLabel(browser(UA.chromeAndroidPhone, { model: "x".repeat(200), mobile: true })).name
        expect(name).toBe(`Chrome on ${"x".repeat(90)}`)
    })

    it("counts characters, never cutting one in half", () => {
        const name = composeDeviceLabel(browser(UA.chromeAndroidPhone, { model: "😀".repeat(120), mobile: true })).name
        expect(name).toBe(`Chrome on ${"😀".repeat(90)}`)
    })

    it("keeps the joiners an emoji is made of", () => {
        const name = composeDeviceLabel(browser(UA.chromeAndroidPhone, { model: `Bob's ${TECHNOLOGIST}`, mobile: true })).name
        expect(name).toBe(`Chrome on Bob's ${TECHNOLOGIST}`)
    })
})

describe("composeDeviceLabel — the desktop app", () => {
    const app = (model: string | null, computerName: string | null, os: "macOS" | "Windows" | "Linux" = "Windows") =>
        composeDeviceLabel({ client: "app", os, model, computerName })

    it("names the computer by its model, then its name in brackets", () => {
        expect(app("Lenovo ThinkPad X1 Carbon Gen 9", "alice-thinkpad")).toEqual({
            name: "Lenovo ThinkPad X1 Carbon Gen 9 (alice-thinkpad)",
            kind: "laptop",
            client: "app",
        })
    })

    it("names it by its name alone when that holds the model", () => {
        expect(app("MacBook Air", "Alice's MacBook Air", "macOS").name).toBe("Alice's MacBook Air")
        expect(app("MacBook Air", "Alice's macbook air", "macOS").name).toBe("Alice's macbook air")
        expect(app("iMac", "bob-imac", "macOS").name).toBe("bob-imac")
    })

    it("finds the model in the name as whole words only", () => {
        expect(app("iMac", "jimac-server", "macOS").name).toBe("iMac (jimac-server)")
        expect(app("MacBook Air", "Alices-MacBook-Air", "macOS").name).toBe("MacBook Air (Alices-MacBook-Air)")
        expect(app("QEMU Standard PC (Q35 + ICH9, 2009)", "bob's QEMU Standard PC (Q35 + ICH9, 2009)", "Linux").name).toBe(
            "bob's QEMU Standard PC (Q35 + ICH9, 2009)",
        )
    })

    it("puts the system in the model's place", () => {
        expect(app(null, "alice-pc").name).toBe("Windows (alice-pc)")
        expect(app(null, "Linux box", "Linux").name).toBe("Linux (Linux box)")
    })

    it("goes without the computer's name when there is none", () => {
        expect(app("Dell XPS 13 9310", null, "Linux").name).toBe("Dell XPS 13 9310")
        expect(app(null, null, "Linux")).toEqual({ name: "Linux", kind: "laptop", client: "app" })
    })

    it("shortens the computer's name to stay within 100 characters, its bracket closed", () => {
        const name = app("Lenovo ThinkPad X1 Carbon Gen 9", `bob-${"x".repeat(120)}`).name

        expect(Array.from(name)).toHaveLength(100)
        expect(name.startsWith("Lenovo ThinkPad X1 Carbon Gen 9 (bob-xxx")).toBe(true)
        expect(name.endsWith("x…)")).toBe(true)
    })

    it("shortens a computer's name standing alone too", () => {
        const name = app("MacBook Air", `Bob's MacBook Air ${"y".repeat(120)}`, "macOS").name

        expect(Array.from(name)).toHaveLength(100)
        expect(name.endsWith("y…")).toBe(true)
    })

    it("drops invisible characters from a host name, and a name of nothing else", () => {
        const hidden = `${ZWSP}alice${BOM}-pc${RTL_OVERRIDE}`
        expect(app(null, hidden).name).toBe("Windows (alice-pc)")
        expect(app("Surface Laptop 4", `${ZWSP}${BOM}`).name).toBe("Surface Laptop 4")
        expect(app(`${ZWSP}`, null, "Linux").name).toBe("Linux")
    })
})

describe("desktopOsOf", () => {
    it("reads the app's system from its User-Agent", () => {
        expect(desktopOsOf(UA.chromeWindows)).toBe("Windows")
        expect(desktopOsOf(UA.chromeMac)).toBe("macOS")
        expect(desktopOsOf(UA.chromeLinux)).toBe("Linux")
        expect(desktopOsOf("")).toBe("Linux")
    })
})

describe("deviceName", () => {
    it("trims what is left once the characters are dropped", () => {
        expect(deviceName(`  ${ZWSP} Alice's tablet ${BOM} `)).toBe("Alice's tablet")
    })

    it.each([
        ["an Arabic letter mark", 0x061c],
        ["a soft hyphen", 0x00ad],
        ["a Mongolian vowel separator", 0x180e],
        ["a function application", 0x2061],
        ["an invisible plus", 0x2064],
        ["a Hangul choseong filler", 0x115f],
        ["a Hangul jungseong filler", 0x1160],
        ["a Hangul filler", 0x3164],
        ["a halfwidth Hangul filler", 0xffa0],
        ["a blank braille pattern", 0x2800],
    ])("drops %s, which the IdP refuses", (_case, codePoint) => {
        const hidden = String.fromCodePoint(codePoint)
        expect(deviceName(`Bob${hidden}'s phone${hidden}`)).toBe("Bob's phone")
        expect(deviceName(hidden.repeat(3))).toBeNull()
    })

    it("has nothing for joiners alone", () => {
        expect(deviceName(`${ZWJ}${ZWJ}`)).toBeNull()
        expect(deviceName("   ")).toBeNull()
    })
})

describe("thisDeviceLabel", () => {
    const PIXEL = browser(UA.chromeAndroidPhone, { model: "Pixel 8", mobile: true })
    const facts = (...answers: (GatheredFacts | Error)[]) => {
        const gather = vi.fn(async (): Promise<GatheredFacts> => {
            const answer = answers.length > 1 ? answers.shift()! : answers[0]
            if (answer instanceof Error) throw answer
            return answer
        })
        return { known: () => browser(UA.chromeAndroidPhone), gather } satisfies IDeviceFactsPort
    }

    it("names the device by its User-Agent at once, then by every fact once gathered", async () => {
        const source = thisDeviceLabel(facts({ facts: PIXEL, late: false }))

        expect(source.now().name).toBe("Chrome on Android")
        expect((await source.settled()).name).toBe("Chrome on Pixel 8")
        expect(source.now().name).toBe("Chrome on Pixel 8")
    })

    it("gathers the facts once a run", async () => {
        const port = facts({ facts: PIXEL, late: false })
        const source = thisDeviceLabel(port)

        await Promise.all([source.settled(), source.settled()])
        await source.settled()

        expect(port.gather).toHaveBeenCalledOnce()
    })

    it("keeps no name the platform answered too late for, and asks again at the next request", async () => {
        const port = facts({ facts: browser(UA.chromeAndroidPhone), late: true }, { facts: PIXEL, late: false })
        const source = thisDeviceLabel(port)

        expect((await source.settled()).name).toBe("Chrome on Android")
        expect(source.now().name).toBe("Chrome on Android")
        expect((await source.settled()).name).toBe("Chrome on Pixel 8")
        await source.settled()

        expect(port.gather).toHaveBeenCalledTimes(2)
    })

    it("keeps the User-Agent's name when the platform refused its hints", async () => {
        const port = facts({ facts: browser(UA.chromeAndroidPhone), late: false })
        const source = thisDeviceLabel(port)

        await source.settled()
        expect(await source.settled()).toEqual(label("Chrome on Android", "phone"))

        expect(port.gather).toHaveBeenCalledOnce()
    })

    it("names the device by its User-Agent when the facts can't be had, and asks again", async () => {
        const port = facts(new Error("refused"), { facts: PIXEL, late: false })
        const source = thisDeviceLabel(port)

        expect(await source.settled()).toEqual(label("Chrome on Android", "phone"))
        expect((await source.settled()).name).toBe("Chrome on Pixel 8")
    })
})
