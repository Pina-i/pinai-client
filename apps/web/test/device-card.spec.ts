/**
 * Settings → Devices' card (`identity-provider/specs/e2ee.md § 3.12`): the Pīna'i mark on the app's
 * icon, read with its kind as one; the automatic name first among the facts once the user chose
 * another; the pencil, and the name renamed in place — Enter saves, Escape cancels (Settings stays),
 * an unchanged name sends nothing, an empty one gives the automatic name back, a failure keeps the
 * field and says why, a rename withdrawn closes it.
 */
import { act, createElement, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { DeviceRow } from "@/presentation/hooks/useDevices"
import { Modal } from "@/presentation/molecules/Modal/Modal"
import { DeviceCard } from "@/presentation/pages/home/SettingsModal/DevicesEditor/DeviceCard/DeviceCard"
import type { RenameDevice } from "@/presentation/pages/home/SettingsModal/DevicesEditor/DeviceCard/DeviceCard.viewmodel"

const RENAME_FAILED = "Couldn't rename this device — try again."
const NAME_REFUSED = "That name can't be used."

function device(change: Partial<DeviceRow> = {}): DeviceRow {
    return {
        device_id: "550e8400-e29b-41d4-a716-446655440000",
        display_name: "Firefox on Linux",
        automatic_name: "Firefox on Linux",
        chosen_name: null,
        kind: "laptop",
        client: "browser",
        paired_at: "2026-11-01T00:00:00Z",
        last_seen_at: "2026-11-04T00:00:00Z",
        revoked_at: null,
        signed_in: true,
        last_active_at: null,
        drk_public_key: null,
        attestation_signature: null,
        attestation_kid: null,
        attestation_expires_at: null,
        hpke_public_key: null,
        hpke_key_signature: null,
        history_generation: null,
        approvals: [],
        is_current: false,
        ...change,
    }
}

let root: Root | null = null
let container: HTMLElement

const cardOf = (row: DeviceRow, onRename?: RenameDevice, approvedBy: string | null = null) =>
    createElement(DeviceCard, { device: row, holdsHistory: false, approvedBy, onRevoke: () => undefined, onRename })

async function mount(node: ReactNode) {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root?.render(node))
}

const render = (row: DeviceRow, onRename?: RenameDevice, approvedBy: string | null = null) => mount(cardOf(row, onRename, approvedBy))
const rerender = (node: ReactNode) => act(async () => root?.render(node))

const icon = () => container.querySelector<HTMLElement>('[role="img"]')
const input = () => document.body.querySelector<HTMLInputElement>('input[aria-label="Device name"]')
const byLabel = (label: string) => document.body.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
const alert = () => document.body.querySelector<HTMLElement>('[role="alert"]')
/** The elements showing exactly `text`, in document order. */
const showing = (text: string | RegExp) =>
    [...container.querySelectorAll("*")].filter(
        (e) => e.childElementCount === 0 && (typeof text === "string" ? e.textContent === text : text.test(e.textContent ?? "")),
    )
const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

async function startRename(name: string) {
    await act(async () => byLabel(`Rename ${name}`)?.click())
}

async function type(value: string) {
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
    await act(async () => {
        setValue.call(input(), value)
        input()!.dispatchEvent(new Event("input", { bubbles: true }))
    })
}

async function press(key: string, target: Element | null = input()) {
    await act(async () => {
        target!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
    })
}

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(async () => {
    const leaving = root
    root = null
    await act(async () => leaving?.unmount())
    container.remove()
})

describe("the device's icon", () => {
    it("carries the Pīna'i mark for the app, read with its kind: “Laptop, Pīna'i app”", async () => {
        await render(device({ client: "app", display_name: "ThinkPad X1 Carbon (alice-thinkpad)" }))

        expect(icon()?.getAttribute("aria-label")).toBe("Laptop, Pīna'i app")
        expect(icon()?.querySelectorAll("svg")).toHaveLength(2)
    })

    it.each([
        ["a browser", "browser", "phone", "Phone"],
        ["a client that never said", "unknown", "tablet", "Tablet"],
    ] as const)("carries no mark for %s, read as its kind alone", async (_, client, kind, label) => {
        await render(device({ client, kind }))

        expect(icon()?.getAttribute("aria-label")).toBe(label)
        expect(icon()?.querySelectorAll("svg")).toHaveLength(1)
    })
})

describe("the facts line", () => {
    it("puts the automatic name first once the user chose another", async () => {
        await render(device({ display_name: "Alice's laptop", chosen_name: "Alice's laptop" }), undefined, "your 24 words")

        const [automatic] = showing("Firefox on Linux")
        expect(before(automatic, showing("approved by your 24 words")[0])).toBe(true)
        expect(before(automatic, showing(/^paired /)[0])).toBe(true)
        expect(before(showing("Alice's laptop")[0], automatic)).toBe(true)
    })

    it("leaves it out while the automatic name is the one shown", async () => {
        await render(device(), undefined, "your 24 words")

        expect(showing("Firefox on Linux")).toHaveLength(1)
        expect(before(showing("Firefox on Linux")[0], showing("approved by your 24 words")[0])).toBe(true)
    })
})

describe("renaming in place", () => {
    const named = () => device({ display_name: "Alice's laptop", chosen_name: "Alice's laptop" })

    it("offers the pencil after the name, named for it; none without a rename", async () => {
        await render(named(), vi.fn())
        expect(byLabel("Rename Alice's laptop")).not.toBeNull()

        await rerender(cardOf(named()))
        expect(byLabel("Rename Alice's laptop")).toBeNull()
    })

    it("opens on the shown name, selected", async () => {
        await render(named(), vi.fn())
        await startRename("Alice's laptop")

        expect(input()?.value).toBe("Alice's laptop")
        expect(document.activeElement).toBe(input())
        expect([input()?.selectionStart, input()?.selectionEnd]).toEqual([0, "Alice's laptop".length])
        expect(input()?.placeholder).toBe("Firefox on Linux")
    })

    it("holds 50 characters as the IdP counts them, never half an emoji", async () => {
        await render(named(), vi.fn())
        await startRename("Alice's laptop")

        await type("😀".repeat(60))

        expect(Array.from(input()!.value)).toHaveLength(50)
        expect(input()!.value).toBe("😀".repeat(50))
    })

    it("opens empty on a shown name over the limit, the automatic name as its placeholder", async () => {
        const long = `Lenovo ThinkPad X1 Carbon Gen 9 (${"a".repeat(60)})`
        await render(device({ display_name: long, automatic_name: long }), vi.fn())
        await startRename(long)

        expect(input()?.value).toBe("")
        expect(input()?.placeholder).toBe(long)
    })

    it("cancels on Escape, sending nothing, the focus back on the pencil", async () => {
        const rename = vi.fn<RenameDevice>(async () => "renamed")
        await render(named(), rename)
        await startRename("Alice's laptop")
        await type("Alice's old laptop")

        await press("Escape")

        expect(input()).toBeNull()
        expect(rename).not.toHaveBeenCalled()
        expect(showing("Alice's laptop")).toHaveLength(1)
        expect(document.activeElement).toBe(byLabel("Rename Alice's laptop"))
    })

    it("cancels on Escape inside Settings without closing it", async () => {
        // jsdom has no `CSS.escape`, which React Aria's modal reads.
        if (!globalThis.CSS?.escape) vi.stubGlobal("CSS", { ...globalThis.CSS, escape: (text: string) => text })
        const onClose = vi.fn()
        await mount(createElement(Modal, { isOpen: true, onClose, variant: "fullscreen", label: "Settings", children: cardOf(named(), vi.fn()) }))
        await startRename("Alice's laptop")

        await press("Escape")

        expect(input()).toBeNull()
        expect(onClose).not.toHaveBeenCalled()
        expect(document.body.querySelector('[role="dialog"][aria-label="Settings"]')).not.toBeNull()

        // Escape anywhere else still closes it: the field kept it to itself.
        await press("Escape", byLabel("Rename Alice's laptop"))
        expect(onClose).toHaveBeenCalledOnce()
        vi.unstubAllGlobals()
    })

    it("closes on Enter with the name unchanged, sending nothing", async () => {
        const rename = vi.fn<RenameDevice>(async () => "renamed")
        await render(named(), rename)
        await startRename("Alice's laptop")

        await press("Enter")

        expect(input()).toBeNull()
        expect(rename).not.toHaveBeenCalled()
    })

    it("saves on Enter, the field read-only and busy meanwhile, the focus kept; closes once the name is given", async () => {
        let answer: (outcome: "renamed") => void = () => undefined
        const rename = vi.fn<RenameDevice>(() => new Promise((resolve) => (answer = resolve)))
        await render(named(), rename)
        await startRename("Alice's laptop")
        await type("  Alice's work laptop ")

        await press("Enter")

        expect(rename).toHaveBeenCalledWith("Alice's work laptop")
        expect(input()?.readOnly).toBe(true)
        expect(input()?.getAttribute("aria-busy")).toBe("true")
        expect(document.activeElement).toBe(input())
        await press("Enter")
        await press("Escape")
        expect(rename).toHaveBeenCalledOnce()
        expect(input()).not.toBeNull()

        await act(async () => answer("renamed"))
        expect(input()).toBeNull()
        expect(document.activeElement).toBe(byLabel("Rename Alice's laptop"))
    })

    it("sends what the IdP takes: no control or invisible character", async () => {
        const rename = vi.fn<RenameDevice>(async () => "renamed")
        await render(named(), rename)
        await startRename("Alice's laptop")
        await type("Alice​'s\u0007 phone‮")

        await press("Enter")

        expect(rename).toHaveBeenCalledWith("Alice's phone")
    })

    it("sends null for an empty field: the automatic name back; the save button does as Enter", async () => {
        const rename = vi.fn<RenameDevice>(async () => "renamed")
        await render(named(), rename)
        await startRename("Alice's laptop")
        await type("")

        await act(async () => byLabel("Save name")?.click())

        expect(rename).toHaveBeenCalledWith(null)
        expect(input()).toBeNull()
    })

    it.each([
        ["no answer", "failed", RENAME_FAILED],
        ["a name the IdP won't take", "invalid", NAME_REFUSED],
    ] as const)("keeps the field on %s, saying why under it, tied to the field", async (_, outcome, line) => {
        const rename = vi.fn<RenameDevice>(async () => outcome)
        await render(named(), rename)
        await startRename("Alice's laptop")
        await type("Alice's work laptop")

        await press("Enter")

        expect(alert()?.textContent).toBe(line)
        expect(input()?.value).toBe("Alice's work laptop")
        expect(input()?.readOnly).toBe(false)
        expect(input()?.getAttribute("aria-invalid")).toBe("true")
        expect(input()?.getAttribute("aria-describedby")?.split(" ")).toContain(alert()?.id)
        expect(document.activeElement).toBe(input())

        rename.mockResolvedValueOnce("renamed")
        await press("Enter")
        expect(rename).toHaveBeenCalledTimes(2)
        expect(input()).toBeNull()
        expect(alert()).toBeNull()
    })

    it("closes on a rename withdrawn — refused for approval, or the device gone — the focus on the name", async () => {
        await render(named(), async () => "withdrawn")
        await startRename("Alice's laptop")
        await type("Alice's work laptop")

        await press("Enter")

        expect(input()).toBeNull()
        expect(alert()).toBeNull()
        expect(document.activeElement?.textContent).toBe("Alice's laptop")
        expect((document.activeElement as HTMLElement).tabIndex).toBe(-1)
    })

    it("closes the field when the rename is withdrawn meanwhile, and doesn't open it again when it comes back", async () => {
        const rename = vi.fn<RenameDevice>(async () => "failed")
        await render(named(), rename)
        await startRename("Alice's laptop")
        await type("Alice's work laptop")
        await press("Enter")
        expect(alert()?.textContent).toBe(RENAME_FAILED)

        await rerender(cardOf(named()))
        expect(input()).toBeNull()
        expect(byLabel("Rename Alice's laptop")).toBeNull()

        await rerender(cardOf(named(), rename))
        expect(input()).toBeNull()
        expect(alert()).toBeNull()
        expect(byLabel("Rename Alice's laptop")).not.toBeNull()
    })
})
