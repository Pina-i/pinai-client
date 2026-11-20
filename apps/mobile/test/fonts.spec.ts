import { describe, expect, it } from "vitest"
import config from "../app.config"
import { type } from "../src/theme/themes.generated"

describe("the embedded fonts", () => {
    it("hold every family the type scale names", () => {
        const plugin = config.plugins?.find((p) => Array.isArray(p) && p[0] === "expo-font") as [string, { android: { fonts: { fontFamily: string }[] } }]
        const embedded = plugin[1].android.fonts.map((f) => f.fontFamily)
        for (const style of Object.values(type)) expect(embedded).toContain(style.fontFamily)
    })
})
