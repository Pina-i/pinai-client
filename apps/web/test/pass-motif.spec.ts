/**
 * Pass's motif (`templates/PassShell`) at the prototype's opacity, the user's choice: 9 % on a dark
 * ground, 20 % on paper, whatever the palette — its own token, not the app's `--motif-opacity`.
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { PassShell } from "@/presentation/templates/PassShell/PassShell"

const stylesheet = document.createElement("style")

beforeAll(() => {
    stylesheet.textContent = readFileSync(path.resolve(import.meta.dirname, "../src/index.css"), "utf8")
    document.head.appendChild(stylesheet)
})

afterAll(() => {
    stylesheet.remove()
    document.documentElement.removeAttribute("class")
    delete document.documentElement.dataset.theme
})

/** The opacity the page paints Pass's motif at, under `theme`. */
function motifOpacity(family: string, mode: "dark" | "light"): string {
    document.documentElement.className = mode
    document.documentElement.dataset.theme = `${family}-${mode}`
    const host = document.createElement("div")
    host.innerHTML = renderToStaticMarkup(createElement(PassShell, { instance: "kauai.studio", title: "First connection", children: "card" }))
    document.body.appendChild(host)
    const motif = host.querySelector<HTMLElement>(".pointer-events-none.absolute.inset-0 > *")
    const token = motif?.style.opacity.match(/^var\((--[\w-]+)\)$/)?.[1]
    const value = token ? getComputedStyle(motif as HTMLElement).getPropertyValue(token).trim() : ""
    host.remove()
    return value
}

describe("Pass's motif", () => {
    it("is drawn at 9 % in dark and 20 % in light, in every palette", () => {
        for (const family of ["pearl", "lagoon", "jungle", "sand"]) {
            expect(motifOpacity(family, "dark")).toBe("0.09")
            expect(motifOpacity(family, "light")).toBe("0.20")
        }
    })
})
