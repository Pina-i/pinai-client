import { afterEach, describe, expect, it, vi } from "vitest"

import {
    brandOf,
    computerNameOf,
    devicetreeModel,
    distributionId,
    linuxFacts,
    macFacts,
    modelOf,
    readComputerFacts,
    readOnce,
    systemReads,
    windowsFacts,
    within,
    type Answer,
    type ComputerReading,
    type FactReads,
} from "../src/main/device-facts"
import {
    FEDORA_OS_RELEASE,
    LINUX_DELL,
    LINUX_LENOVO,
    LINUX_QEMU,
    LINUX_WHITEBOX,
    MAC_HARDWARE,
    MAC_INTEL_HARDWARE,
    RASPBERRY_PI_MODEL,
    UBUNTU_OS_RELEASE,
    WINDOWS_HP,
    WINDOWS_HYPER_V,
    WINDOWS_LENOVO,
    WINDOWS_WHITEBOX,
} from "./fixtures/device-facts"

const NO_DMI = { vendor: null, productName: null, productVersion: null, family: null }

describe("windowsFacts", () => {
    it("names a Lenovo by its version, not its type code", () => {
        expect(windowsFacts({ bios: WINDOWS_LENOVO, hostname: "alice-thinkpad" })).toEqual({
            os: "Windows",
            model: "Lenovo ThinkPad X1 Carbon Gen 9",
            computerName: "alice-thinkpad",
        })
    })

    it("names an HP by its product name, without the words for its type", () => {
        expect(windowsFacts({ bios: WINDOWS_HP, hostname: "BOB-HP" }).model).toBe("HP EliteBook 840 G8")
    })

    it("knows no model of a PC whose firmware fills nothing in, nor the name Windows made up", () => {
        expect(windowsFacts({ bios: WINDOWS_WHITEBOX, hostname: "DESKTOP-4F2K9QZ" })).toEqual({
            os: "Windows",
            model: null,
            computerName: null,
        })
    })

    it("tidies the brand of a virtual machine", () => {
        expect(windowsFacts({ bios: WINDOWS_HYPER_V, hostname: "alice-vm" }).model).toBe("Microsoft Virtual Machine")
    })

    it("knows nothing from no answer", () => {
        expect(windowsFacts({ bios: null, hostname: null })).toEqual({ os: "Windows", model: null, computerName: null })
    })
})

describe("linuxFacts", () => {
    it("names a Lenovo by its product version", () => {
        expect(linuxFacts({ dmi: LINUX_LENOVO, osRelease: FEDORA_OS_RELEASE, hostname: "alice-thinkpad" })).toEqual({
            os: "Linux",
            model: "Lenovo ThinkPad X1 Carbon Gen 9",
            computerName: "alice-thinkpad",
        })
    })

    it("names a Dell by its product name, the brand tidied", () => {
        expect(linuxFacts({ dmi: LINUX_DELL, osRelease: UBUNTU_OS_RELEASE, hostname: "bob-xps" })).toEqual({
            os: "Linux",
            model: "Dell XPS 13 9310",
            computerName: "bob-xps",
        })
    })

    it("knows no model behind placeholders, nor a live system's name", () => {
        expect(linuxFacts({ dmi: LINUX_WHITEBOX, osRelease: FEDORA_OS_RELEASE, hostname: "localhost-live" })).toEqual({
            os: "Linux",
            model: null,
            computerName: null,
        })
    })

    it("names a virtual machine, and skips the distribution's name for the computer's", () => {
        expect(linuxFacts({ dmi: LINUX_QEMU, osRelease: FEDORA_OS_RELEASE, hostname: "fedora" })).toEqual({
            os: "Linux",
            model: "QEMU Standard PC (Q35 + ICH9, 2009)",
            computerName: null,
        })
    })

    it("names an ARM board with no DMI by its device tree", () => {
        expect(linuxFacts({ dmi: NO_DMI, devicetree: RASPBERRY_PI_MODEL, osRelease: null, hostname: "bob-pi" })).toEqual({
            os: "Linux",
            model: "Raspberry Pi 5 Model B Rev 1.0",
            computerName: "bob-pi",
        })
    })

    it("prefers DMI to the device tree", () => {
        expect(linuxFacts({ dmi: LINUX_DELL, devicetree: RASPBERRY_PI_MODEL, osRelease: null, hostname: null }).model).toBe(
            "Dell XPS 13 9310",
        )
    })
})

describe("macFacts", () => {
    it("names a Mac by its machine name and the name its user gave it", () => {
        expect(
            macFacts({ hardware: MAC_HARDWARE, computerName: "Alice's MacBook Air\n", hostname: "Alices-MacBook-Air.local" }),
        ).toEqual({ os: "macOS", model: "MacBook Air", computerName: "Alice's MacBook Air" })
    })

    it("names an Intel Mac the same way", () => {
        expect(macFacts({ hardware: MAC_INTEL_HARDWARE, computerName: "Bob's MacBook Pro", hostname: null }).model).toBe(
            "MacBook Pro",
        )
    })

    it("falls back on the host name, `.local` dropped", () => {
        expect(macFacts({ hardware: MAC_HARDWARE, computerName: null, hostname: "Alices-MacBook-Air.local" }).computerName).toBe(
            "Alices-MacBook-Air",
        )
    })

    it("knows no model from an answer that isn't JSON", () => {
        expect(macFacts({ hardware: "system_profiler: crashed", computerName: null, hostname: null }).model).toBeNull()
    })
})

describe("brandOf", () => {
    it.each([
        ["Dell Inc.", "Dell"],
        ["DELL", "Dell"],
        ["LENOVO", "Lenovo"],
        ["Hewlett-Packard", "HP"],
        ["HP", "HP"],
        ["ASUSTeK COMPUTER INC.", "ASUS"],
        ["ASUSTeK COMPUTER INC", "ASUS"],
        ["Micro-Star International Co., Ltd.", "MSI"],
        ["Micro-Star International Co.,Ltd.", "MSI"],
        ["Microsoft Corporation", "Microsoft"],
        ["Apple Inc.", "Apple"],
        ["Samsung Electronics Co., Ltd.", "Samsung"],
        ["Gigabyte Technology Co., Ltd.", "Gigabyte"],
        ["VMware, Inc.", "VMware"],
        ["innotek GmbH", "innotek"],
        ["Intel Corp.", "Intel"],
        ["Acer Ltd.", "Acer"],
        ["  Framework  ", "Framework"],
    ])("writes %j as %s", (vendor, brand) => {
        expect(brandOf(vendor)).toBe(brand)
    })

    it("has none for a placeholder", () => {
        expect(brandOf("System manufacturer")).toBeNull()
        expect(brandOf(null)).toBeNull()
    })
})

describe("modelOf", () => {
    const hardware = (vendor: string | null, productName: string | null, family: string | null = null) => ({
        vendor,
        productName,
        productVersion: null,
        family,
    })

    it("puts the brand in front", () => {
        expect(modelOf(hardware("Micro-Star International Co., Ltd.", "Prestige 14"))).toBe("MSI Prestige 14")
        expect(modelOf(hardware("innotek GmbH", "VirtualBox"))).toBe("innotek VirtualBox")
    })

    it("adds no brand a name holds already, whatever its case", () => {
        expect(modelOf(hardware("ASUSTeK COMPUTER INC.", "Asus Zenbook 14"))).toBe("Asus Zenbook 14")
        expect(modelOf(hardware("VMware, Inc.", "VMware Virtual Platform"))).toBe("VMware Virtual Platform")
    })

    it("drops the words for the device's type, never the model's own", () => {
        expect(modelOf(hardware("HP", "HP ProDesk 400 G7 Desktop PC"))).toBe("HP ProDesk 400 G7")
        expect(modelOf(hardware("HP", "HP Laptop 15-dw1xxx"))).toBe("HP Laptop 15-dw1xxx")
    })

    it("takes the family when the product name is a placeholder", () => {
        expect(modelOf(hardware("Dell Inc.", "Default string", "Latitude"))).toBe("Dell Latitude")
    })

    it("takes a Lenovo's family when its version is a placeholder, never its type code", () => {
        expect(modelOf({ vendor: "LENOVO", productName: "20XWCTO1WW", productVersion: "None", family: "ThinkPad T14" })).toBe(
            "Lenovo ThinkPad T14",
        )
        expect(modelOf({ vendor: "LENOVO", productName: "20XWCTO1WW", productVersion: null, family: null })).toBeNull()
    })

    it("names a model with no brand as it is", () => {
        expect(modelOf(hardware(null, "Custom Build"))).toBe("Custom Build")
        expect(modelOf(hardware("Not Specified", "Custom Build"))).toBe("Custom Build")
    })

    it.each(["Not Applicable", "INVALID", "0123456789", "Type1ProductConfigId", "not specified", "  "])(
        "takes %j for no product name",
        (placeholder) => {
            expect(modelOf(hardware("Dell Inc.", placeholder))).toBeNull()
        },
    )
})

describe("devicetreeModel", () => {
    it("drops the trailing NUL", () => {
        expect(devicetreeModel(RASPBERRY_PI_MODEL)).toBe("Raspberry Pi 5 Model B Rev 1.0")
        expect(devicetreeModel(null)).toBeNull()
    })
})

describe("computerNameOf", () => {
    it.each(["DESKTOP-4F2K9QZ", "LAPTOP-1A2B3C4D", "WIN-0A1B2C3D4E5", "desktop-4f2k9qz"])("skips Windows' made-up %s", (name) => {
        expect(computerNameOf(name, "Windows")).toBeNull()
    })

    it("keeps a Windows name the user chose", () => {
        expect(computerNameOf("DESKTOP-ALICE", "Windows")).toBe("DESKTOP-ALICE")
        expect(computerNameOf("LAPTOP-1A2B3C4", "Windows")).toBe("LAPTOP-1A2B3C4")
    })

    it.each(["localhost", "localhost-live", "localhost.localdomain", "localhost4", "localhost6.localdomain6", "Fedora"])(
        "skips Linux's default %s",
        (name) => {
            expect(computerNameOf(name, "Linux", "fedora")).toBeNull()
        },
    )

    it("drops `.local` and `.localdomain`", () => {
        expect(computerNameOf("bob-desktop.localdomain", "Linux")).toBe("bob-desktop")
        expect(computerNameOf("Bobs-iMac.local", "macOS")).toBe("Bobs-iMac")
    })
})

describe("distributionId", () => {
    it("reads the ID, quoted or not", () => {
        expect(distributionId(FEDORA_OS_RELEASE)).toBe("fedora")
        expect(distributionId('ID="opensuse-tumbleweed"\n')).toBe("opensuse-tumbleweed")
        expect(distributionId(null)).toBeNull()
    })
})

describe("readComputerFacts", () => {
    const answer = (text: string | null, late = false): Answer => ({ text, late })
    const reads = (change: Partial<FactReads> = {}): FactReads => ({
        run: vi.fn(async () => answer(null)),
        read: vi.fn(async () => answer(null)),
        hostname: () => null,
        ...change,
    })

    it("asks a Mac's system for its hardware, giving it longer, and for its name", async () => {
        const run = vi.fn(async (file: string, _args: string[], _capMs: number) =>
            answer(file.endsWith("system_profiler") ? MAC_HARDWARE : "Alice's MacBook Air\n"),
        )

        expect(await readComputerFacts("darwin", reads({ run }))).toEqual({
            facts: { os: "macOS", model: "MacBook Air", computerName: "Alice's MacBook Air" },
            late: false,
        })
        expect(run).toHaveBeenCalledWith("/usr/sbin/system_profiler", ["SPHardwareDataType", "-json"], 5_000)
        expect(run).toHaveBeenCalledWith("/usr/sbin/scutil", ["--get", "ComputerName"], 2_000)
    })

    it("asks Windows' own reg.exe for the BIOS key", async () => {
        const run = vi.fn(async (_file: string, _args: string[], _capMs: number) => answer(WINDOWS_LENOVO))

        const { facts } = await readComputerFacts("win32", reads({ run, hostname: () => "alice-thinkpad" }), {
            SystemRoot: "D:\\WINDOWS",
        })

        expect(facts.model).toBe("Lenovo ThinkPad X1 Carbon Gen 9")
        expect(run.mock.calls[0][0]).toBe("D:\\WINDOWS\\System32\\reg.exe")
        expect(run.mock.calls[0][1]).toEqual(["query", "HKLM\\HARDWARE\\DESCRIPTION\\System\\BIOS"])
    })

    it.each([[{}], [{ SystemRoot: "" }], [{ SystemRoot: "Windows" }]])(
        "finds reg.exe under C:\\Windows without a usable SystemRoot (%j)",
        async (env) => {
            const run = vi.fn(async (_file: string, _args: string[], _capMs: number) => answer(null))

            await readComputerFacts("win32", reads({ run }), env)

            expect(run.mock.calls[0][0]).toBe("C:\\Windows\\System32\\reg.exe")
        },
    )

    it("reads Linux's DMI files", async () => {
        const files: Record<string, string> = {
            "/sys/class/dmi/id/sys_vendor": LINUX_DELL.vendor,
            "/sys/class/dmi/id/product_name": LINUX_DELL.productName,
            "/etc/os-release": UBUNTU_OS_RELEASE,
        }
        const read = vi.fn(async (file: string) => answer(files[file] ?? null))

        expect(await readComputerFacts("linux", reads({ read, hostname: () => "ubuntu" }))).toEqual({
            facts: { os: "Linux", model: "Dell XPS 13 9310", computerName: null },
            late: false,
        })
    })

    it("reads an ARM board's device tree", async () => {
        const read = vi.fn(async (file: string) =>
            answer(file === "/sys/firmware/devicetree/base/model" ? RASPBERRY_PI_MODEL : null),
        )

        expect((await readComputerFacts("linux", reads({ read }))).facts.model).toBe("Raspberry Pi 5 Model B Rev 1.0")
    })

    it("says a read ran past its cap", async () => {
        const run = vi.fn(async (file: string) =>
            file.endsWith("system_profiler") ? answer(null, true) : answer("Bob's iMac"),
        )

        expect(await readComputerFacts("darwin", reads({ run }))).toEqual({
            facts: { os: "macOS", model: null, computerName: "Bob's iMac" },
            late: true,
        })
    })

    it("knows nothing, and throws nothing, when every read fails", async () => {
        const failing = reads({
            run: async () => Promise.reject(new Error("no such command")),
            read: async () => Promise.reject(new Error("no such file")),
            hostname: () => {
                throw new Error("no hostname")
            },
        })

        for (const [platform, os] of [["darwin", "macOS"], ["win32", "Windows"], ["linux", "Linux"]] as const) {
            expect(await readComputerFacts(platform, failing)).toEqual({ facts: { os, model: null, computerName: null }, late: false })
        }
    })
})

describe("readOnce", () => {
    const reading = (late: boolean): ComputerReading => ({ facts: { os: "Linux", model: null, computerName: null }, late })

    it("reads once, whoever asks", async () => {
        const read = vi.fn(async () => reading(false))
        const ask = readOnce(read)

        await Promise.all([ask(), ask()])
        await ask()

        expect(read).toHaveBeenCalledOnce()
    })

    it("reads again at the next ask after a read that ran late", async () => {
        const read = vi.fn(async () => reading(read.mock.calls.length === 1))
        const ask = readOnce(read)

        expect((await ask()).late).toBe(true)
        expect((await ask()).late).toBe(false)
        await ask()

        expect(read).toHaveBeenCalledTimes(2)
    })
})

describe("systemReads", () => {
    afterEach(() => vi.useRealTimers())

    it("answers a command's output", async () => {
        expect(await systemReads.run(process.execPath, ["-e", "process.stdout.write('alice-pc')"], 5_000)).toEqual({
            text: "alice-pc",
            late: false,
        })
    })

    it("answers nothing for a command that fails or isn't there, and a file that isn't", async () => {
        expect(await systemReads.run("/bin/false", [], 2_000)).toEqual({ text: null, late: false })
        expect(await systemReads.run("/nonexistent/pinai-reader", [], 2_000)).toEqual({ text: null, late: false })
        expect(await systemReads.read("/nonexistent/pinai-file", 2_000)).toEqual({ text: null, late: false })
    })

    it("stops a command that runs past its cap, and says it was late", async () => {
        const started = Date.now()

        const answer = await systemReads.run(process.execPath, ["-e", "setInterval(()=>{},1e3)"], 200)

        expect(answer).toEqual({ text: null, late: true })
        expect(Date.now() - started).toBeLessThan(1_500)
    })

    it("gives a read its cap, then answers it late", async () => {
        vi.useFakeTimers()
        const onLate = vi.fn()
        const reading = within(new Promise(() => {}), 2_000, onLate)

        await vi.advanceTimersByTimeAsync(2_000)

        expect(await reading).toEqual({ text: null, late: true })
        expect(onLate).toHaveBeenCalledOnce()
    })
})
