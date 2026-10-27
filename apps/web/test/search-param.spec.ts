/**
 * A parameter a screen takes from the URL once — `?instance=`, `?settings=` — is dropped from it,
 * the rest of the URL kept, so a reload or a sign-in coming back doesn't take it again.
 */
import { describe, expect, it } from "vitest"

import { ARRIVAL_PARAM } from "@/presentation/_libs/instance-arrival"
import { withoutSearchParam } from "@/presentation/_libs/search-param"

describe("withoutSearchParam", () => {
    it("drops the parameter and keeps the others", () => {
        expect(withoutSearchParam({ pathname: "/", searchStr: "?instance=localhost%3A8097" }, ARRIVAL_PARAM)).toBe("/")
        expect(withoutSearchParam({ pathname: "/home", searchStr: "?a=1&settings=instance&b=2" }, "settings")).toBe("/home?a=1&b=2")
    })

    it("drops every copy of it", () => {
        expect(withoutSearchParam({ pathname: "/", searchStr: "?instance=a.nz&instance=b.nz" }, ARRIVAL_PARAM)).toBe("/")
    })

    it("leaves a URL without it alone", () => {
        expect(withoutSearchParam({ pathname: "/", searchStr: "" }, ARRIVAL_PARAM)).toBeNull()
        expect(withoutSearchParam({ pathname: "/home", searchStr: "?instances=x" }, ARRIVAL_PARAM)).toBeNull()
    })
})
