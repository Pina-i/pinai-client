import { describe, expect, it } from "vitest"
import { isModShortcut, modShortcutLabel } from "@/presentation/_libs/shortcut-key"

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init)

describe("isModShortcut", () => {
    it("takes ⌘ on Apple devices", () => {
        expect(isModShortcut(key({ key: "k", metaKey: true }), "k", true)).toBe(true)
        expect(isModShortcut(key({ key: "k", ctrlKey: true }), "k", true)).toBe(false)
    })

    it("takes Ctrl elsewhere", () => {
        expect(isModShortcut(key({ key: "k", ctrlKey: true }), "k", false)).toBe(true)
        expect(isModShortcut(key({ key: "k", metaKey: true }), "k", false)).toBe(false)
    })

    it("takes the key whatever its case, and no other modifier", () => {
        expect(isModShortcut(key({ key: "K", ctrlKey: true }), "k", false)).toBe(true)
        expect(isModShortcut(key({ key: "K", ctrlKey: true, shiftKey: true }), "k", false)).toBe(false)
        expect(isModShortcut(key({ key: "k", ctrlKey: true, altKey: true }), "k", false)).toBe(false)
        expect(isModShortcut(key({ key: "k", ctrlKey: true, metaKey: true }), "k", false)).toBe(false)
        expect(isModShortcut(key({ key: "k" }), "k", false)).toBe(false)
        expect(isModShortcut(key({ key: "j", ctrlKey: true }), "k", false)).toBe(false)
    })
})

describe("modShortcutLabel", () => {
    it("names the key as each keyboard shows it", () => {
        expect(modShortcutLabel("k", true)).toBe("⌘K")
        expect(modShortcutLabel("k", false)).toBe("Ctrl K")
    })
})
