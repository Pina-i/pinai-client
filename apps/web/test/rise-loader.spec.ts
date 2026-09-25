import { readFileSync } from "node:fs"
import path from "node:path"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { RiseLoader } from "@/presentation/atoms/rise-loader/rise-loader"
import { AuthShell } from "@/presentation/templates/AuthShell/AuthShell"

function parse(html: string): Element {
    const template = document.createElement("template")
    template.innerHTML = html
    return template.content.firstElementChild!
}

// Whitespace between tags is only the file's indentation, and React Aria's generated ids differ per render.
function normalized(node: Node): Node {
    for (const child of [...node.childNodes]) {
        if (child.nodeType === Node.TEXT_NODE && !child.textContent!.trim()) child.remove()
        else normalized(child)
    }
    if (node instanceof Element) node.removeAttribute("id")
    return node
}

function bootSplash(): Document {
    const html = readFileSync(path.resolve(import.meta.dirname, "../index.html"), "utf8")
    return new DOMParser().parseFromString(html, "text/html")
}

describe("RiseLoader", () => {
    it("wakes up the island by default, and takes any title", () => {
        expect(parse(renderToStaticMarkup(createElement(RiseLoader))).querySelector(".pn-rise-title")!.textContent).toBe(
            "Waking up the island",
        )
        expect(
            parse(renderToStaticMarkup(createElement(RiseLoader, { title: "Syncing" }))).querySelector(".pn-rise-title")!
                .textContent,
        ).toBe("Syncing")
    })

    it("puts the host on the mono line", () => {
        const loader = parse(renderToStaticMarkup(createElement(RiseLoader, { host: "idp.example.test" })))
        expect(loader.querySelector(".pn-rise-host")!.textContent).toBe("idp.example.test")
    })

    it("is exactly what index.html paints as the app's boot splash", () => {
        const boot = bootSplash().querySelector("#pn-splash > .pn-splash-app > .pn-rise")!
        const rendered = parse(renderToStaticMarkup(createElement(RiseLoader)))

        expect(normalized(boot.cloneNode(true)).isEqualNode(normalized(rendered))).toBe(true)
    })

    // The landing's Continue shows the loader in this panel and hands over to that copy on the IdP's login page.
    it("inside an AuthShell, is exactly what index.html paints for the pages that open on one", () => {
        const boot = bootSplash().querySelector("#pn-splash > .pn-splash-shell > *")!
        const rendered = parse(renderToStaticMarkup(createElement(AuthShell, null, createElement(RiseLoader))))

        expect(normalized(boot.cloneNode(true)).isEqualNode(normalized(rendered))).toBe(true)
    })
})
