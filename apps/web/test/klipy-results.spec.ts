/** The GIF picker sends Klipy's WebP of an animation where there is one: the same frames, far fewer bytes. */
import { describe, expect, it, vi } from "vitest"

vi.mock("@/ioc", () => ({ getNodeInfoPort: vi.fn() }))
vi.mock("@/store/store", () => ({ useAppStore: vi.fn() }))

const { parseResults } = await import("@/presentation/molecules/GifPopover/useKlipy")

const variant = (url: string) => ({ url, width: 320, height: 240 })

describe("Klipy's results", () => {
    it("takes each tier's WebP, the grid's small one and the sent medium one", () => {
        const [gif] = parseResults({
            data: {
                data: [
                    {
                        id: 7,
                        title: "wave",
                        file: {
                            sm: { gif: variant("sm.gif"), webp: variant("sm.webp") },
                            md: { gif: variant("md.gif"), webp: variant("md.webp") },
                        },
                    },
                ],
            },
        })
        expect(gif).toEqual({
            id: "7",
            description: "wave",
            previewUrl: "sm.webp",
            gifUrl: "md.webp",
            mimeType: "image/webp",
            width: 320,
            height: 240,
        })
    })

    it("keeps the tier and falls back to its GIF, rather than a heavier tier's WebP", () => {
        const [gif] = parseResults({
            data: { data: [{ id: 7, file: { md: { gif: variant("md.gif") }, hd: { webp: variant("hd.webp") } } }] },
        })
        expect(gif).toMatchObject({ gifUrl: "md.gif", mimeType: "image/gif", previewUrl: "md.gif" })
    })

    it("leaves out an item with nothing to show", () => {
        expect(parseResults({ data: { data: [{ id: 7, file: { md: { mp4: variant("md.mp4") } } }] } })).toEqual([])
        expect(parseResults(undefined)).toEqual([])
    })
})
