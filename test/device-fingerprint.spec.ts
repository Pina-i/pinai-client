import { describe, expect, it } from "vitest"

import { deviceFingerprint } from "@/presentation/_libs/device-fingerprint"

describe("deviceFingerprint", () => {
    it("is deterministic for the same UUID", () => {
        const id = "21111111-2222-3333-4444-555555555555"
        expect(deviceFingerprint(id)).toBe(deviceFingerprint(id))
    })

    it("changes when the UUID changes (collision-free in small sets)", () => {
        const a = deviceFingerprint("11111111-1111-1111-1111-111111111111")
        const b = deviceFingerprint("22222222-2222-2222-2222-222222222222")
        const c = deviceFingerprint("33333333-3333-3333-3333-333333333333")
        expect(a).not.toBe(b)
        expect(a).not.toBe(c)
        expect(b).not.toBe(c)
    })

    it("formats as XXXX-XXXX (8 base32 chars + dash)", () => {
        const fp = deviceFingerprint("abcdefab-cdef-abcd-efab-cdefabcdefab")
        expect(fp).toMatch(/^[A-Z2-7]{4}-[A-Z2-7]{4}$/)
    })

    it("uses RFC 4648 base32 alphabet (no 0/1/8/9 confusion)", () => {
        for (let i = 0; i < 32; i++) {
            const id = `${i.toString(16).padStart(8, "0")}-aaaa-bbbb-cccc-dddddddddddd`
            const fp = deviceFingerprint(id)
            expect(fp).not.toMatch(/[01890]/)
        }
    })
})
