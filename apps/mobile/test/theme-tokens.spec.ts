/// <reference types="node" />
import { readFileSync } from "node:fs"
import { THEME_FAMILIES, THEME_MODES } from "@pinai/domain/models/user-settings"
import { describe, expect, it } from "vitest"
import { buildThemes, mixOklab, resolveColors, toHex } from "../scripts/theme-tokens.mjs"

const tokens = JSON.parse(readFileSync(new URL("../design-system/tokens.json", import.meta.url), "utf8"))

describe("toHex", () => {
    it("turns oklch into the hex a browser paints", () => {
        expect(toHex("oklch(0.145 0.014 196)")).toBe("#040c0c")
        expect(toHex("oklch(0.950 0.008 190)")).toBe("#e9f0ef")
    })

    it("keeps the alpha", () => {
        expect(toHex("oklch(1 0 0 / .050)")).toBe("#ffffff0d")
        expect(toHex("oklch(0.760 0.098 176 / .16)")).toBe("#65c6af29")
    })

    it("maps a colour outside sRGB into it rather than clipping each channel", () => {
        const hex = toHex("oklch(0.7 0.4 145)")
        expect(hex).toMatch(/^#[0-9a-f]{6}$/)
        expect(hex).not.toBe("#00ff00")
    })

    it("takes hex as it is", () => {
        expect(toHex("#afbea5")).toBe("#afbea5")
    })
})

describe("mixOklab", () => {
    it("weighs the first colour", () => {
        expect(mixOklab("#000000", "#ffffff", 1)).toBe("#000000")
        expect(mixOklab("#000000", "#ffffff", 0)).toBe("#ffffff")
    })
})

describe("resolveColors", () => {
    it("follows references to their colour", () => {
        const css = resolveColors(tokens, "black-pearl")
        expect(css["card-foreground"]).toBe(css.foreground)
        expect(css["motif-color"]).toBe(css.chat)
    })
})

describe("buildThemes", () => {
    const { themes } = buildThemes(tokens) as unknown as { themes: Record<string, { colors: Record<string, string> }> }

    it("gives every theme of the domain colours", () => {
        const ids = THEME_FAMILIES.flatMap((family) => THEME_MODES.map((mode) => `${family}-${mode}`))
        expect(Object.keys(themes).sort()).toEqual(ids.sort())
    })

    it("gives every theme the same tokens, all hex", () => {
        const names = Object.keys(themes["pearl-dark"].colors).sort()
        for (const theme of Object.values(themes)) {
            expect(Object.keys(theme.colors).sort()).toEqual(names)
            for (const value of Object.values(theme.colors)) expect(value).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/)
        }
    })

    it("leans a light theme's inks toward its foreground, and leaves a dark theme's", () => {
        expect(themes["pearl-dark"].colors.dndInk).toBe(themes["pearl-dark"].colors.dnd)
        expect(themes["pearl-light"].colors.dndInk).not.toBe(themes["pearl-light"].colors.dnd)
    })
})
