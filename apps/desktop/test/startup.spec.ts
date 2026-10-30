import { describe, expect, it } from "vitest"

import { refusesToStart } from "../src/main/startup"

const switches = (...names: string[]) => (name: string) => names.includes(name)

describe("refusesToStart", () => {
    it.each([
        "remote-debugging-port",
        "remote-debugging-pipe",
        "log-net-log",
        "ssl-key-log-file",
        "ignore-certificate-errors",
        "ignore-certificate-errors-spki-list",
    ])("refuses a packaged app given --%s", (name) => {
        expect(refusesToStart(true, switches(name), {})).toBe(true)
    })

    it("refuses a packaged app whose TLS keys are asked for in the environment", () => {
        expect(refusesToStart(true, switches(), { SSLKEYLOGFILE: "/tmp/keys" })).toBe(true)
    })

    it("starts otherwise, and always in dev", () => {
        expect(refusesToStart(true, switches(), {})).toBe(false)
        expect(refusesToStart(true, switches("ozone-platform", "proxy-server"), {})).toBe(false)
        expect(refusesToStart(false, switches("remote-debugging-port"), {})).toBe(false)
        expect(refusesToStart(false, switches(), { SSLKEYLOGFILE: "/tmp/keys" })).toBe(false)
    })
})
