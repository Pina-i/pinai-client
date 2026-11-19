import { type ChildProcess, execFile } from "child_process"
import { readFile } from "fs/promises"
import os from "os"
import path from "path"

import type { ComputerFacts, DesktopOs } from "@pinai/domain/models/device-label"

/** What a computer's firmware says of it, as DMI and Windows' BIOS key both give it. */
export interface Hardware {
    vendor: string | null
    productName: string | null
    productVersion: string | null
    family: string | null
}

// What vendors leave in the fields they fill nothing in.
const PLACEHOLDERS = new Set([
    "system product name",
    "system version",
    "system manufacturer",
    "to be filled by o.e.m.",
    "default string",
    "not applicable",
    "not specified",
    "none",
    "invalid",
    "0123456789",
    "type1productconfigid",
])

// Legal forms name no brand: "VMware, Inc." is VMware, "Gigabyte Technology Co., Ltd." Gigabyte.
const LEGAL_FORMS = /(?:[\s,]+(?:inc|gmbh|co\.?,?\s*ltd|ltd|corporation|corp|technology)\.?)+[\s,]*$/i

// What still differs once the legal form is gone.
const BRANDS: Record<string, string> = {
    "asustek computer": "ASUS",
    "micro-star international": "MSI",
    "hewlett-packard": "HP",
    "samsung electronics": "Samsung",
    lenovo: "Lenovo",
    dell: "Dell",
}

// The device's type, which its icon says: HP's "EliteBook 840 G8 Notebook PC".
const TYPE_SUFFIX = /\s+(?:Notebook|Desktop) PC$/i

function filled(raw: string | null | undefined): string | null {
    const text = raw?.trim() ?? ""
    return text === "" || PLACEHOLDERS.has(text.toLowerCase()) ? null : text
}

/** The brand as people write it: legal forms dropped, a few names tidied. */
export function brandOf(vendor: string | null): string | null {
    const name = filled(vendor)?.replace(LEGAL_FORMS, "").trim()
    if (!name) return null
    return BRANDS[name.toLowerCase()] ?? name
}

/** The computer's marketing name, with its brand: "Lenovo ThinkPad X1 Carbon Gen 9", "Dell XPS 13 9310". */
export function modelOf(hardware: Hardware): string | null {
    const brand = brandOf(hardware.vendor)
    // Lenovo's product name is a machine type code (`20XWCTO1WW`); its version is the marketing name.
    const name = (
        brand === "Lenovo"
            ? (filled(hardware.productVersion) ?? filled(hardware.family))
            : (filled(hardware.productName) ?? filled(hardware.family))
    )?.replace(TYPE_SUFFIX, "")
    if (!name) return null
    return brand === null || name.toLowerCase().includes(brand.toLowerCase()) ? name : `${brand} ${name}`
}

/** `/sys/firmware/devicetree/base/model`, where ARM boards have no DMI: "Raspberry Pi 5 Model B Rev 1.0". */
export function devicetreeModel(raw: string | null): string | null {
    return filled(raw?.replace(/\0+$/, ""))
}

/** `reg query "HKLM\HARDWARE\DESCRIPTION\System\BIOS"`'s `REG_SZ` values. */
export function windowsHardware(output: string | null): Hardware {
    const values = new Map<string, string>()
    for (const line of (output ?? "").split(/\r?\n/)) {
        const match = /^\s*(\w+)\s+REG_SZ(?:\s+(.*))?$/.exec(line)
        if (match) values.set(match[1], match[2] ?? "")
    }
    return {
        vendor: values.get("SystemManufacturer") ?? null,
        productName: values.get("SystemProductName") ?? null,
        productVersion: values.get("SystemVersion") ?? null,
        family: values.get("SystemFamily") ?? null,
    }
}

/** `system_profiler SPHardwareDataType -json`'s `machine_name`: "MacBook Air". */
export function macModel(output: string | null): string | null {
    try {
        const parsed = JSON.parse(output ?? "") as { SPHardwareDataType?: { machine_name?: unknown }[] }
        const name = parsed.SPHardwareDataType?.[0]?.machine_name
        return typeof name === "string" ? filled(name) : null
    } catch {
        return null
    }
}

/** `/etc/os-release`'s `ID`: `fedora`, `ubuntu`. */
export function distributionId(osRelease: string | null): string | null {
    const line = (osRelease ?? "").split(/\r?\n/).find((l) => l.startsWith("ID="))
    const id = line?.slice("ID=".length).trim().replace(/^["']|["']$/g, "")
    return id ? id.toLowerCase() : null
}

// The names Windows makes up fill NetBIOS's 15 characters; Linux's are `localhost` and its variants.
const WINDOWS_DEFAULT = /^(DESKTOP-[A-Z0-9]{7}|LAPTOP-[A-Z0-9]{8}|WIN-[A-Z0-9]{11})$/i

/** The name the user gave the computer, or null for none — or one its system made up. */
export function computerNameOf(raw: string | null, system: DesktopOs, distribution: string | null = null): string | null {
    const name = (raw ?? "").trim().replace(/\.(local|localdomain)$/i, "")
    if (name === "") return null
    if (system === "Windows" && WINDOWS_DEFAULT.test(name)) return null
    const lower = name.toLowerCase()
    if (system === "Linux" && (lower.startsWith("localhost") || lower === distribution)) return null
    return name
}

export function macFacts(read: { hardware: string | null; computerName: string | null; hostname: string | null }): ComputerFacts {
    return {
        os: "macOS",
        model: macModel(read.hardware),
        computerName: computerNameOf(read.computerName, "macOS") ?? computerNameOf(read.hostname, "macOS"),
    }
}

export function windowsFacts(read: { bios: string | null; hostname: string | null }): ComputerFacts {
    return { os: "Windows", model: modelOf(windowsHardware(read.bios)), computerName: computerNameOf(read.hostname, "Windows") }
}

export function linuxFacts(read: {
    dmi: Hardware
    devicetree?: string | null
    osRelease: string | null
    hostname: string | null
}): ComputerFacts {
    return {
        os: "Linux",
        model: modelOf(read.dmi) ?? devicetreeModel(read.devicetree ?? null),
        computerName: computerNameOf(read.hostname, "Linux", distributionId(read.osRelease)),
    }
}

/** A read's text, null when it failed; `late` when it ran past its cap. */
export interface Answer {
    text: string | null
    late: boolean
}

/** How the facts are read, each within `capMs`; none throws. */
export interface FactReads {
    run(file: string, args: string[], capMs: number): Promise<Answer>
    read(file: string, capMs: number): Promise<Answer>
    hostname(): string | null
}

/** The facts, and whether a read ran past its cap: asked again, it may tell more. */
export interface ComputerReading {
    facts: ComputerFacts
    late: boolean
}

const READ_CAP_MS = 2_000
// Off the critical path, and slow on a cold start.
const PROFILER_CAP_MS = 5_000

/** The computer's facts, any failure a `null`. Never rejects. */
export async function readComputerFacts(
    platform: NodeJS.Platform,
    reads: FactReads = systemReads,
    env: Record<string, string | undefined> = process.env,
): Promise<ComputerReading> {
    const system: DesktopOs = platform === "darwin" ? "macOS" : platform === "win32" ? "Windows" : "Linux"
    try {
        if (system === "macOS") {
            const [hardware, computerName] = await Promise.all([
                reads.run("/usr/sbin/system_profiler", ["SPHardwareDataType", "-json"], PROFILER_CAP_MS),
                reads.run("/usr/sbin/scutil", ["--get", "ComputerName"], READ_CAP_MS),
            ])
            return {
                facts: macFacts({ hardware: hardware.text, computerName: computerName.text, hostname: reads.hostname() }),
                late: anyLate(hardware, computerName),
            }
        }
        if (system === "Windows") {
            const bios = await reads.run(regExe(env), ["query", "HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS"], READ_CAP_MS)
            return { facts: windowsFacts({ bios: bios.text, hostname: reads.hostname() }), late: anyLate(bios) }
        }
        const read = (file: string) => reads.read(file, READ_CAP_MS)
        const answers = await Promise.all([
            read("/sys/class/dmi/id/sys_vendor"),
            read("/sys/class/dmi/id/product_name"),
            read("/sys/class/dmi/id/product_version"),
            read("/sys/class/dmi/id/product_family"),
            read("/sys/firmware/devicetree/base/model"),
            read("/etc/os-release"),
        ])
        const [vendor, productName, productVersion, family, devicetree, osRelease] = answers.map((answer) => answer.text)
        return {
            facts: linuxFacts({
                dmi: { vendor, productName, productVersion, family },
                devicetree,
                osRelease,
                hostname: reads.hostname(),
            }),
            late: anyLate(...answers),
        }
    } catch {
        return { facts: { os: system, model: null, computerName: null }, late: false }
    }
}

function anyLate(...answers: Answer[]): boolean {
    return answers.some((answer) => answer.late)
}

// `SystemRoot` may be unset or not a path; `reg.exe` is never looked up on `PATH`.
function regExe(env: Record<string, string | undefined>): string {
    const found = path.win32.join(env.SystemRoot || "C:\\Windows", "System32", "reg.exe")
    return path.win32.isAbsolute(found) ? found : "C:\\Windows\\System32\\reg.exe"
}

/** Reads the facts once; again at the next ask after a reading that ran late. */
export function readOnce(read: () => Promise<ComputerReading>): () => Promise<ComputerReading> {
    let reading: Promise<ComputerReading> | null = null
    return () => {
        if (reading) return reading
        const current = read().then((answer) => {
            if (answer.late) reading = null
            return answer
        })
        reading = current
        return current
    }
}

export const systemReads: FactReads = {
    run: (file, args, capMs) => {
        let child: ChildProcess | undefined
        const output = new Promise<string | null>((resolve) => {
            child = execFile(file, args, { windowsHide: true, encoding: "utf8" }, (error, stdout) => resolve(error ? null : stdout))
        })
        return within(output, capMs, () => child?.kill())
    },
    read: (file, capMs) => within(readFile(file, "utf8"), capMs),
    hostname: () => {
        try {
            return os.hostname()
        } catch {
            return null
        }
    },
}

/** `reading`'s answer, or none past `capMs` — `onLate` then stops it — or on a failure. */
export function within(reading: Promise<string | null>, capMs: number, onLate: () => void = () => {}): Promise<Answer> {
    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            resolve({ text: null, late: true })
            onLate()
        }, capMs)
        reading
            .then(
                (text) => resolve({ text, late: false }),
                () => resolve({ text: null, late: false }),
            )
            .finally(() => clearTimeout(timer))
    })
}
