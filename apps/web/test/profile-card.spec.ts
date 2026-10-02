/**
 * The card reads one account by its actor URI, which the adapter puts in the query string. An
 * account the IdP shows the viewer nothing of reads as no card, not as a failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { UserApiAdapter } from "@pinai/api/user/user-api.adapter"
import { pronounsLabel, type ProfileCard } from "@pinai/domain/models/profile"
import type { IUserPort } from "@pinai/domain/ports/user.port"
import { getProfileCardUseCase } from "@pinai/domain/usecases/user/get-profile-card.usecase"
import { cardCells } from "@/presentation/organisms/PersonProfileModal/_helpers/profile-card.helper"

const IDP = "http://localhost:8080"
const BOB = "https://idp.bob.test/users/bob_k2m9x"
const CARD: ProfileCard = {
    actor_uri: BOB,
    display_name: "Bob",
    avatar_url: null,
    pronouns: "he",
    bio: "Kia ora\nWellington",
    friends_since: "2025-01-12T10:00:00Z",
}

function userPort(getProfileCard = vi.fn().mockResolvedValue(CARD)) {
    return { getProfileCard } as unknown as IUserPort
}

function answering(status: number, body: unknown) {
    const fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
    )
    vi.stubGlobal("fetch", fetch)
    return fetch
}

function requested(fetch: ReturnType<typeof vi.fn>): Request {
    return fetch.mock.calls[0][0] as Request
}

describe("getProfileCardUseCase", () => {
    it("reads the card by the actor URI", async () => {
        const port = userPort()

        const card = await getProfileCardUseCase(IDP, "tok", ` ${BOB} `, port)

        expect(card).toEqual(CARD)
        expect(port.getProfileCard).toHaveBeenCalledWith(IDP, "tok", BOB)
    })

    it("refuses an empty actor URI without calling the IdP", async () => {
        const port = userPort()

        await expect(getProfileCardUseCase(IDP, "tok", "  ", port)).rejects.toThrow("cannot be empty")
        expect(port.getProfileCard).not.toHaveBeenCalled()
    })
})

describe("UserApiAdapter.getProfileCard", () => {
    afterEach(() => vi.unstubAllGlobals())

    it("asks for the actor in the query string, with the token", async () => {
        const fetch = answering(200, CARD)

        const card = await new UserApiAdapter().getProfileCard(`${IDP}/`, "tok", BOB)

        expect(card).toEqual(CARD)
        const request = requested(fetch)
        const url = new URL(request.url)
        expect(url.pathname).toBe("/api/profiles")
        expect(url.searchParams.get("actor")).toBe(BOB)
        expect(request.headers.get("Authorization")).toBe("Bearer tok")
    })

    it("reads an account the IdP shows nothing of as no card", async () => {
        answering(404, { error: "not_found", error_description: "User not found" })

        expect(await new UserApiAdapter().getProfileCard(IDP, "tok", BOB)).toBeNull()
    })

    it("passes any other refusal through", async () => {
        answering(400, { error: "invalid_request", error_description: "`actor` is not an actor URI" })

        await expect(new UserApiAdapter().getProfileCard(IDP, "tok", "bob")).rejects.toThrow(
            "`actor` is not an actor URI",
        )
    })
})

describe("pronounsLabel", () => {
    it("spells each choice as the profile editor offers it", () => {
        expect([pronounsLabel("he"), pronounsLabel("she"), pronounsLabel("non-binary")]).toEqual([
            "he / him",
            "she / her",
            "non-binary",
        ])
        expect(pronounsLabel(null)).toBeNull()
    })
})

describe("the card's cells", () => {
    it("show the pronouns, the bio and the day the friendship began", () => {
        expect(cardCells(CARD, "UTC")).toEqual({
            pronouns: "he / him",
            bio: "Kia ora\nWellington",
            friendsSince: "12 Jan 2025",
        })
    })

    it("say what the account doesn't show", () => {
        const bare = { ...CARD, pronouns: null, bio: null, friends_since: null }

        expect(cardCells(bare, "UTC")).toEqual({ pronouns: "—", bio: null, friendsSince: "Not friends" })
    })

    it("stay blank until the card is read, and claim no friendship the IdP doesn't show", () => {
        expect(cardCells(undefined)).toEqual({ pronouns: "—", bio: null, friendsSince: "—" })
        expect(cardCells(null)).toEqual({ pronouns: "—", bio: null, friendsSince: "Not friends" })
    })
})
