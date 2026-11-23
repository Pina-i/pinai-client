import { asActorUri } from "@pinai/domain/models/identity"
import { describe, expect, it } from "vitest"
import { accountStoreNames } from "../src/adapters/storage/account-store-names"

describe("accountStoreNames", () => {
    it("names an account's database and key after the account, apart from every other account's", () => {
        const alice = accountStoreNames(asActorUri("https://idp.example/users/alice"))
        const pierre = accountStoreNames(asActorUri("https://idp.example/users/pierre"))

        expect(alice).toEqual({
            database: "e2ee-https%3A%2F%2Fidp.example%2Fusers%2Falice.db",
            keyAlias: "pinai.device-key.https%3A%2F%2Fidp.example%2Fusers%2Falice",
        })
        expect(pierre.database).not.toBe(alice.database)
        expect(pierre.keyAlias).not.toBe(alice.keyAlias)
    })

    it("keeps a database name a single file name", () => {
        expect(accountStoreNames(asActorUri("https://idp.example/users/a/b")).database).not.toContain("/")
    })
})
