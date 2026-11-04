/**
 * SPAKE2 as RFC 9382 specifies it, suite SPAKE2-P256-SHA256-HKDF-HMAC: M and N regenerated from
 * Appendix A's seeds, and the four runs of Appendix B — pA, pB, K, TT, Hash(TT), Ke, Ka, KcA, KcB
 * and both confirmations — from the w, x and y they give.
 */
import { describe, expect, it } from "vitest"
import { p256 } from "@noble/curves/nist.js"
import { sha256 } from "@noble/hashes/sha2.js"

import {
    SPAKE2_M,
    SPAKE2_N,
    decodeShare,
    keySchedule,
    passwordScalar,
    spake2Finish,
    spake2Share,
} from "@pinai/crypto/spake2-p256"

const hex = (text: string) => Uint8Array.from(text.replace(/\s|^0x/g, "").match(/../g)!.map((b) => parseInt(b, 16)))
const toHex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
const big = (text: string) => BigInt(`0x${text.replace(/\s|^0x/g, "")}`)
const ascii = (text: string) => new TextEncoder().encode(text)

/** Appendix A: SHA-256 iterated over the seed, the blocks joined, the first byte made 0x02 or 0x03. */
function generatedPoint(seed: string): string {
    const iterated = (n: number) => {
        let h = ascii(seed)
        for (let i = 0; i < n; i++) h = sha256(h)
        return h
    }
    for (let i = 1; i < 1000; i++) {
        const blocks = new Uint8Array([...iterated(i), ...iterated(i + 1)]).slice(0, 33)
        blocks[0] = (blocks[0] & 1) | 2
        try {
            const point = p256.Point.fromBytes(blocks)
            point.assertValidity()
            return toHex(blocks)
        } catch {
            // Not on the curve: the next block.
        }
    }
    throw new Error("no point")
}

const VECTORS = [
    {
        A: "server",
        B: "client",
        w: "2ee57912099d31560b3a44b1184b9b4866e904c49d12ac5042c97dca461b1a5f",
        x: "43dd0fd7215bdcb482879fca3220c6a968e66d70b1356cac18bb26c84a78d729",
        pA: "04a56fa807caaa53a4d28dbb9853b9815c61a411118a6fe516a8798434751470f9010153ac33d0d5f2047ffdb1a3e42c9b4e6be662766e1eeb4116988ede5f912c",
        y: "dcb60106f276b02606d8ef0a328c02e4b629f84f89786af5befb0bc75b6e66be",
        pB: "0406557e482bd03097ad0cbaa5df82115460d951e3451962f1eaf4367a420676d09857ccbc522686c83d1852abfa8ed6e4a1155cf8f1543ceca528afb591a1e0b7",
        K: "0412af7e89717850671913e6b469ace67bd90a4df8ce45c2af19010175e37eed69f75897996d539356e2fa6a406d528501f907e04d97515fbe83db277b715d3325",
        TT: `06000000000000007365727665720600000000000000636c69656e744100000
            00000000004a56fa807caaa53a4d28dbb9853b9815c61a411118a6fe516a8798434751
            470f9010153ac33d0d5f2047ffdb1a3e42c9b4e6be662766e1eeb4116988ede5f912c4
            1000000000000000406557e482bd03097ad0cbaa5df82115460d951e3451962f1eaf43
            67a420676d09857ccbc522686c83d1852abfa8ed6e4a1155cf8f1543ceca528afb591a
            1e0b741000000000000000412af7e89717850671913e6b469ace67bd90a4df8ce45c2a
            f19010175e37eed69f75897996d539356e2fa6a406d528501f907e04d97515fbe83db2
            77b715d332520000000000000002ee57912099d31560b3a44b1184b9b4866e904c49d1
            2ac5042c97dca461b1a5f`,
        hash: "0e0672dc86f8e45565d338b0540abe6915bdf72e2b35b5c9e5663168e960a91b",
        Ke: "0e0672dc86f8e45565d338b0540abe69",
        Ka: "15bdf72e2b35b5c9e5663168e960a91b",
        KcA: "00c12546835755c86d8c0db7851ae86f",
        KcB: "a9fa3406c3b781b93d804485430ca27a",
        cA: "58ad4aa88e0b60d5061eb6b5dd93e80d9c4f00d127c65b3b35b1b5281fee38f0",
        cB: "d3e2e547f1ae04f2dbdbf0fc4b79f8ecff2dff314b5d32fe9fcef2fb26dc459b",
    },
    {
        A: "",
        B: "client",
        w: "0548d8729f730589e579b0475a582c1608138ddf7054b73b5381c7e883e2efae",
        x: "403abbe3b1b4b9ba17e3032849759d723939a27a27b9d921c500edde18ed654b",
        pA: "04a897b769e681c62ac1c2357319a3d363f610839c4477720d24cbe32f5fd85f44fb92ba966578c1b712be6962498834078262caa5b441ecfa9d4a9485720e918a",
        y: "903023b6598908936ea7c929bd761af6039577a9c3f9581064187c3049d87065",
        pB: "04e0f816fd1c35e22065d5556215c097e799390d16661c386e0ecc84593974a61b881a8c82327687d0501862970c64565560cb5671f696048050ca66ca5f8cc7fc",
        K: "048f83ec9f6e4f87cc6f9dc740bdc2769725f923364f01c84148c049a39a735ebda82eac03e00112fd6a5710682767cff5361f7e819e53d8d3c3a2922e0d837aa6",
        TT: `00000000000000000600000000000000636c69656e74410000000000000004a
            897b769e681c62ac1c2357319a3d363f610839c4477720d24cbe32f5fd85f44fb92ba9
            66578c1b712be6962498834078262caa5b441ecfa9d4a9485720e918a4100000000000
            00004e0f816fd1c35e22065d5556215c097e799390d16661c386e0ecc84593974a61b8
            81a8c82327687d0501862970c64565560cb5671f696048050ca66ca5f8cc7fc4100000
            000000000048f83ec9f6e4f87cc6f9dc740bdc2769725f923364f01c84148c049a39a7
            35ebda82eac03e00112fd6a5710682767cff5361f7e819e53d8d3c3a2922e0d837aa62
            0000000000000000548d8729f730589e579b0475a582c1608138ddf7054b73b5381c7e
            883e2efae`,
        hash: "642f05c473c2cd79909f9a841e2f30a70bf89b18180af97353ba198789c2b963",
        Ke: "642f05c473c2cd79909f9a841e2f30a7",
        Ka: "0bf89b18180af97353ba198789c2b963",
        KcA: "c6be376fc7cd1301fd0a13adf3e7bffd",
        KcB: "b7243f4ae60440a49b3f8cab3c1fba07",
        cA: "47d29e6666af1b7dd450d571233085d7a9866e4d49d2645e2df975489521232b",
        cB: "3313c5cefc361d27fb16847a91c2a73b766ffa90a4839122a9b70a2f6bd1d6df",
    },
    {
        A: "server",
        B: "",
        w: "626e0cdc7b14c9db3e52a0b1b3a768c98e37852d5db30febe0497b14eae8c254",
        x: "07adb3db6bc623d3399726bfdbfd3d15a58ea776ab8a308b00392621291f9633",
        pA: "04f88fb71c99bfffaea370966b7eb99cd4be0ff1a7d335caac4211c4afd855e2e15a873b298503ad8ba1d9cbb9a392d2ba309b48bfd7879aefd0f2cea6009763b0",
        y: "b6a4fc8dbb629d4ba51d6f91ed1532cf87adec98f25dd153a75accafafedec16",
        pB: "040c269d6be017dccb15182ac6bfcd9e2a14de019dd587eaf4bdfd353f031101e7cca177f8eb362a6e83e7d5e729c0732e1b528879c086f39ba0f31a9661bd34db",
        K: "0445ee233b8ecb51ebd6e7da3f307e88a1616bae2166121221fdc0dadb986afaf3ec8a988dc9c626fa3b99f58a7ca7c9b844bb3e8dd9554aafc5b53813504c1cbe",
        TT: `06000000000000007365727665720000000000000000410000000000000004f
            88fb71c99bfffaea370966b7eb99cd4be0ff1a7d335caac4211c4afd855e2e15a873b2
            98503ad8ba1d9cbb9a392d2ba309b48bfd7879aefd0f2cea6009763b04100000000000
            000040c269d6be017dccb15182ac6bfcd9e2a14de019dd587eaf4bdfd353f031101e7c
            ca177f8eb362a6e83e7d5e729c0732e1b528879c086f39ba0f31a9661bd34db4100000
            0000000000445ee233b8ecb51ebd6e7da3f307e88a1616bae2166121221fdc0dadb986
            afaf3ec8a988dc9c626fa3b99f58a7ca7c9b844bb3e8dd9554aafc5b53813504c1cbe2
            000000000000000626e0cdc7b14c9db3e52a0b1b3a768c98e37852d5db30febe0497b1
            4eae8c254`,
        hash: "005184ff460da2ce59062c87733c299c3521297d736598fc0a1127600efa1afb",
        Ke: "005184ff460da2ce59062c87733c299c",
        Ka: "3521297d736598fc0a1127600efa1afb",
        KcA: "f3da53604f0aeecea5a33be7bddf6edf",
        KcB: "9e3f86848736f159bd92b6e107ec6799",
        cA: "bc9f9bbe99f26d0b2260e6456e05a86196a3307ec6663a18bf6ac825736533b2",
        cB: "c2370e1bf813b086dff0d834e74425a06e6390f48f5411900276dcccc5a297ec",
    },
    {
        A: "",
        B: "",
        w: "7bf46c454b4c1b25799527d896508afd5fc62ef4ec59db1efb49113063d70cca",
        x: "8cef65df64bb2d0f83540c53632de911b5b24b3eab6cc74a97609fd659e95473",
        pA: "04a65b367a3f613cf9f0654b1b28a1e3a8a40387956c8ba6063e8658563890f46ca1ef6a676598889fc28de2950ab8120b79a5ef1ea4c9f44bc98f585634b46d66",
        y: "d7a66f64074a84652d8d623a92e20c9675c61cb5b4f6a0063e4648a2fdc02d53",
        pB: "04589f13218822710d98d8b2123a079041052d9941b9cf88c6617ddb2fcc0494662eea8ba6b64692dc318250030c6af045cb738bc81ba35b043c3dcb46adf6f58d",
        K: "041a3c03d51b452537ca2a1fea6110353c6d5ed483c4f0f86f4492ca3f378d40a994b4477f93c64d928edbbcd3e85a7c709b7ea73ee97986ce3d1438e135543772",
        TT: `00000000000000000000000000000000410000000000000004a65b367a3f613
            cf9f0654b1b28a1e3a8a40387956c8ba6063e8658563890f46ca1ef6a676598889fc28
            de2950ab8120b79a5ef1ea4c9f44bc98f585634b46d66410000000000000004589f132
            18822710d98d8b2123a079041052d9941b9cf88c6617ddb2fcc0494662eea8ba6b6469
            2dc318250030c6af045cb738bc81ba35b043c3dcb46adf6f58d4100000000000000041
            a3c03d51b452537ca2a1fea6110353c6d5ed483c4f0f86f4492ca3f378d40a994b4477
            f93c64d928edbbcd3e85a7c709b7ea73ee97986ce3d1438e1355437722000000000000
            0007bf46c454b4c1b25799527d896508afd5fc62ef4ec59db1efb49113063d70cca`,
        hash: "fc6374762ba5cf11f4b2caa08b2cd1b9907ae0e26e8d6234318d91583cd74c86",
        Ke: "fc6374762ba5cf11f4b2caa08b2cd1b9",
        Ka: "907ae0e26e8d6234318d91583cd74c86",
        KcA: "5dbd2f477166b7fb6d61febbd77a5563",
        KcB: "7689b4654407a5faeffdc8f18359d8a3",
        cA: "dfb4db8d48ae5a675963ea5e6c19d98d4ea028d8e898dad96ea19a80ade95dca",
        cB: "d0f0609d1613138d354f7e95f19fb556bf52d751947241e8c7118df5ef0ae175",
    },
]

describe("RFC 9382, SPAKE2-P256-SHA256-HKDF-HMAC", () => {
    it("uses the M and N of § 6, which Appendix A's seeds give", () => {
        expect(toHex(SPAKE2_M.toBytes(true))).toBe("02886e2f97ace46e55ba9dd7242579f2993b64e16ef3dcab95afd497333d8fa12f")
        expect(toHex(SPAKE2_N.toBytes(true))).toBe("03d8bbd6c639c62937b04d997f38c3770719c629d7014d49a24b4f98baa1292b49")
        expect(generatedPoint("1.2.840.10045.3.1.7 point generation seed (M)")).toBe(toHex(SPAKE2_M.toBytes(true)))
        expect(generatedPoint("1.2.840.10045.3.1.7 point generation seed (N)")).toBe(toHex(SPAKE2_N.toBytes(true)))
    })

    for (const v of VECTORS) {
        it(`gives Appendix B's run for A='${v.A}', B='${v.B}'`, () => {
            const w = big(v.w)
            const pA = spake2Share("A", w, big(v.x))
            const pB = spake2Share("B", w, big(v.y))
            expect(toHex(pA)).toBe(v.pA)
            expect(toHex(pB)).toBe(v.pB)

            const common = { w, idA: ascii(v.A), idB: ascii(v.B), aad: new Uint8Array(0) }
            const a = spake2Finish({ ...common, role: "A", scalar: big(v.x), ownShare: pA, peerShare: pB })
            const b = spake2Finish({ ...common, role: "B", scalar: big(v.y), ownShare: pB, peerShare: pA })

            for (const side of [a, b]) {
                expect(toHex(side.k)).toBe(v.K)
                expect(toHex(side.transcript)).toBe(toHex(hex(v.TT)))
                expect(toHex(sha256(side.transcript))).toBe(v.hash)
                expect(toHex(side.ke)).toBe(v.Ke)
                expect(toHex(side.ka)).toBe(v.Ka)
                expect(toHex(side.kcA)).toBe(v.KcA)
                expect(toHex(side.kcB)).toBe(v.KcB)
                expect(toHex(side.confirmA)).toBe(v.cA)
                expect(toHex(side.confirmB)).toBe(v.cB)
            }
        })
    }

    it("binds the AAD into the confirmation keys only", () => {
        const transcript = hex(VECTORS[0].TT)
        const bare = keySchedule(transcript, new Uint8Array(0))
        const bound = keySchedule(transcript, ascii("PINAI-DEVICE-APPROVAL-HANDSHAKE-v1\nrequest"))
        expect(bound.ke).toEqual(bare.ke)
        expect(bound.kcA).not.toEqual(bare.kcA)
        expect(bound.confirmB).not.toEqual(bare.confirmB)
    })

    it("refuses a share that isn't an uncompressed point of the group", () => {
        const pA = hex(VECTORS[0].pA)
        const offCurve = pA.slice()
        offCurve[64] ^= 1
        expect(() => decodeShare(offCurve)).toThrow()
        expect(() => decodeShare(SPAKE2_M.toBytes(true))).toThrow()
        expect(() => decodeShare(new Uint8Array(65))).toThrow()
        expect(decodeShare(pA).equals(p256.Point.fromBytes(pA))).toBe(true)
    })

    it("reduces a 40-byte MHF output modulo p", () => {
        const output = new Uint8Array(40).fill(0xff)
        expect(passwordScalar(output)).toBe(BigInt(`0x${"ff".repeat(40)}`) % p256.Point.Fn.ORDER)
    })
})
