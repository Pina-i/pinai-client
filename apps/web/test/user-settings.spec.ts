/**
 * Settings are read back on every page load — including by releases that no
 * longer ship a palette or motif they name — and in two scopes: the account's
 * (palette, motif) and the device's (mode).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
    ACCOUNT_SETTINGS_KEY,
    DEVICE_SETTINGS_KEY,
    UserSettingsLocalStorageAdapter,
} from "@/adapters/user-settings/user-settings-local-storage.adapter"
import {
    DEFAULT_ACCOUNT_SETTINGS,
    DEFAULT_DEVICE_SETTINGS,
    hasUnsyncedChange,
    mergeAccountSettings,
    parseAccountSettings,
    parseDeviceSettings,
    resolveMode,
    themeId,
} from "@pinai/domain/models/user-settings"
import { loadUserSettingsUseCase } from "@pinai/domain/usecases/user-settings/load-user-settings.usecase"
import { updateAccountSettingsUseCase } from "@pinai/domain/usecases/user-settings/update-account-settings.usecase"
import { updateDeviceSettingsUseCase } from "@pinai/domain/usecases/user-settings/update-device-settings.usecase"
import { pushAccountSettingsUseCase } from "@pinai/domain/usecases/user-settings/push-account-settings.usecase"
import {
    receiveAccountSettingsUseCase,
    syncAccountSettingsOnSignInUseCase,
} from "@pinai/domain/usecases/user-settings/sync-account-settings.usecase"
import type { IAccountSettingsPort } from "@pinai/domain/ports/user-settings.port"
import { isConversationMuted, setConversationMuted } from "@pinai/domain/models/mute"

const IDP = "http://localhost:8080"
const ALICE = "https://idp.alice.test/users/alice_xK9mP"
const BOB = "https://idp.alice.test/users/bob_Qw3rT"
const UNMUTED = { muteAll: false, muteAllUntil: null, mutedConversations: [] }
const LAGOON = { appearance: { family: "lagoon", motif: "raranga" }, notifications: UNMUTED } as const
const SAND = { appearance: { family: "sand", motif: "tapa1" }, notifications: UNMUTED } as const

describe("parseAccountSettings", () => {
    it("keeps a valid stored document", () => {
        const stored = {
            appearance: { family: "lagoon", motif: "tapa3" },
            notifications: { muteAll: true, muteAllUntil: null, mutedConversations: ["dm-1", "group-1"] },
        }

        expect(parseAccountSettings(stored)).toEqual(stored)
    })

    it("falls back field by field, keeping what is still valid", () => {
        expect(parseAccountSettings({ appearance: { family: "coral", motif: "raranga" } })).toEqual({
            appearance: { family: DEFAULT_ACCOUNT_SETTINGS.appearance.family, motif: "raranga" },
            notifications: UNMUTED,
        })
    })

    it("reads a malformed notifications section as unmuted, keeping the conversation ids it can read", () => {
        expect(parseAccountSettings({ notifications: { muteAll: "yes", mutedConversations: "dm-1" } }).notifications).toEqual(
            UNMUTED,
        )
        expect(parseAccountSettings({ notifications: { mutedConversations: ["dm-1", 42, null] } }).notifications).toEqual({
            muteAll: false,
            muteAllUntil: null,
            mutedConversations: ["dm-1"],
        })
    })

    it("keeps the end of a timed mute, and reads anything but a number there as no end", () => {
        const until = Date.UTC(2026, 9, 1, 15, 0)

        expect(parseAccountSettings({ notifications: { muteAll: true, muteAllUntil: until } }).notifications.muteAllUntil).toBe(until)
        for (const muteAllUntil of ["15:00", Number.NaN, null]) {
            expect(parseAccountSettings({ notifications: { muteAll: true, muteAllUntil } }).notifications.muteAllUntil).toBeNull()
        }
    })

    it("returns the defaults for anything that isn't settings", () => {
        for (const raw of [null, undefined, "lagoon", { appearance: 3 }]) {
            expect(parseAccountSettings(raw)).toEqual(DEFAULT_ACCOUNT_SETTINGS)
        }
    })
})

describe("parseDeviceSettings", () => {
    it("keeps a known mode, and follows the system otherwise", () => {
        expect(parseDeviceSettings({ mode: "light" })).toEqual({ mode: "light" })
        expect(parseDeviceSettings({ mode: "sepia" })).toEqual(DEFAULT_DEVICE_SETTINGS)
        expect(DEFAULT_DEVICE_SETTINGS.mode).toBe("system")
    })
})

describe("resolveMode", () => {
    it("paints a chosen mode as is, and system as the OS prefers", () => {
        expect(resolveMode("light", true)).toBe("light")
        expect(resolveMode("system", true)).toBe("dark")
        expect(resolveMode("system", false)).toBe("light")
    })
})

describe("mergeAccountSettings", () => {
    it("changes only the fields the change names", () => {
        const notifications = { muteAll: false, muteAllUntil: null, mutedConversations: ["dm-1"] }
        const current = { appearance: { family: "sand", motif: "tapa1" }, notifications } as const

        expect(mergeAccountSettings(current, { appearance: { motif: "tapa4" } })).toEqual({
            appearance: { family: "sand", motif: "tapa4" },
            notifications: { muteAll: false, muteAllUntil: null, mutedConversations: ["dm-1"] },
        })
    })
})

describe("themeId", () => {
    it("names the theme the CSS is keyed on", () => {
        expect(themeId("sand", "dark")).toBe("sand-dark")
    })
})

describe("UserSettingsLocalStorageAdapter", () => {
    const store = new UserSettingsLocalStorageAdapter()

    afterEach(() => localStorage.clear())

    it("keeps the two scopes under their own keys", () => {
        updateAccountSettingsUseCase(DEFAULT_ACCOUNT_SETTINGS, { appearance: { family: "jungle" } }, ALICE, store)
        updateDeviceSettingsUseCase({ mode: "light" }, store)

        expect(loadUserSettingsUseCase(store)).toEqual({
            account: {
                settings: {
                    appearance: { family: "jungle", motif: DEFAULT_ACCOUNT_SETTINGS.appearance.motif },
                    notifications: UNMUTED,
                },
                unsynced: ["appearance"],
                owner: ALICE,
            },
            device: { mode: "light" },
        })
        expect(JSON.parse(localStorage.getItem(ACCOUNT_SETTINGS_KEY)!)).toMatchObject({ version: 1 })
        expect(JSON.parse(localStorage.getItem(DEVICE_SETTINGS_KEY)!)).toMatchObject({ version: 1, mode: "light" })
    })

    it("carries over the light mode next-themes stored before settings existed", () => {
        localStorage.setItem("theme", "light")

        expect(loadUserSettingsUseCase(store).device).toEqual({ mode: "light" })
    })

    it("drops the legacy key once the device mode is saved", () => {
        localStorage.setItem("theme", "light")

        updateDeviceSettingsUseCase({ mode: "system" }, store)

        expect(localStorage.getItem("theme")).toBeNull()
        expect(loadUserSettingsUseCase(store).device).toEqual({ mode: "system" })
    })

    it("reads a corrupt value as the defaults instead of throwing", () => {
        localStorage.setItem(ACCOUNT_SETTINGS_KEY, "{not json")
        localStorage.setItem(DEVICE_SETTINGS_KEY, "{not json")

        expect(loadUserSettingsUseCase(store)).toEqual({
            account: { settings: DEFAULT_ACCOUNT_SETTINGS, unsynced: [], owner: null },
            device: DEFAULT_DEVICE_SETTINGS,
        })
    })
})

/** The IdP's `PATCH /api/settings`: each section sent replaces the stored one, the others are kept. */
function fakeIdp(document: object): IAccountSettingsPort & { document: object } {
    const idp = {
        document,
        update: async (_idp: string, _token: string, sections: object) => {
            idp.document = { ...idp.document, ...JSON.parse(JSON.stringify(sections)) }
            return idp.document
        },
    }
    return idp
}

describe("account settings sync", () => {
    const store = new UserSettingsLocalStorageAdapter()
    let api: IAccountSettingsPort & { update: ReturnType<typeof vi.fn> }

    beforeEach(() => {
        // The IdP answers with the document it merged, which is what was sent.
        api = { update: vi.fn((_idp: string, _token: string, settings: unknown) => Promise.resolve(settings)) }
    })
    afterEach(() => localStorage.clear())

    const copy = () => loadUserSettingsUseCase(store).account

    it("marks a change synced once the IdP has it", async () => {
        updateAccountSettingsUseCase(DEFAULT_ACCOUNT_SETTINGS, LAGOON, ALICE, store)
        expect(hasUnsyncedChange(copy(), ALICE)).toBe(true)

        await pushAccountSettingsUseCase(IDP, "tok", copy().settings, ALICE, api, store)

        expect(api.update).toHaveBeenCalledWith(IDP, "tok", LAGOON)
        expect(copy()).toEqual({ settings: LAGOON, unsynced: [], owner: ALICE })
    })

    it("leaves a newer change unsynced when an older push lands after it", async () => {
        updateAccountSettingsUseCase(DEFAULT_ACCOUNT_SETTINGS, LAGOON, ALICE, store)
        const inFlight = pushAccountSettingsUseCase(IDP, "tok", LAGOON, ALICE, api, store)
        updateAccountSettingsUseCase(LAGOON, SAND, ALICE, store)

        await inFlight

        expect(copy()).toEqual({ settings: SAND, unsynced: ["appearance", "notifications"], owner: ALICE })
    })

    it("keeps a change unsynced when the IdP can't be reached", async () => {
        updateAccountSettingsUseCase(DEFAULT_ACCOUNT_SETTINGS, LAGOON, ALICE, store)
        api.update.mockRejectedValueOnce(new Error("offline"))

        await expect(pushAccountSettingsUseCase(IDP, "tok", LAGOON, ALICE, api, store)).rejects.toThrow("offline")

        expect(hasUnsyncedChange(copy(), ALICE)).toBe(true)
    })

    it("on sign-in, adopts the account's settings over a synced copy", async () => {
        store.writeAccount(LAGOON, { unsynced: [], owner: ALICE })

        const settings = await syncAccountSettingsOnSignInUseCase(IDP, "tok", SAND, ALICE, api, store)

        expect(settings).toEqual(SAND)
        expect(api.update).not.toHaveBeenCalled()
        expect(copy()).toEqual({ settings: SAND, unsynced: [], owner: ALICE })
    })

    it("on sign-in, sends the change this device couldn't send instead of losing it", async () => {
        updateAccountSettingsUseCase(DEFAULT_ACCOUNT_SETTINGS, LAGOON, ALICE, store)

        const settings = await syncAccountSettingsOnSignInUseCase(IDP, "tok", SAND, ALICE, api, store)

        expect(settings).toEqual(LAGOON)
        expect(api.update).toHaveBeenCalledWith(IDP, "tok", LAGOON)
    })

    it("never sends another account's unsynced change", async () => {
        updateAccountSettingsUseCase(DEFAULT_ACCOUNT_SETTINGS, LAGOON, ALICE, store)

        const settings = await syncAccountSettingsOnSignInUseCase(IDP, "tok", SAND, BOB, api, store)

        expect(settings).toEqual(SAND)
        expect(api.update).not.toHaveBeenCalled()
        expect(copy().owner).toBe(BOB)
    })

    it("adopts another session's change, unless a newer one of its own is pending", () => {
        store.writeAccount(LAGOON, { unsynced: [], owner: ALICE })
        expect(receiveAccountSettingsUseCase(SAND, ALICE, store)).toEqual(SAND)

        updateAccountSettingsUseCase(SAND, LAGOON, ALICE, store)
        expect(receiveAccountSettingsUseCase(SAND, ALICE, store)).toBeNull()
        expect(copy().settings).toEqual(LAGOON)
    })

    it("keeps the mutes another device made while this one had a palette change to send", async () => {
        store.writeAccount(LAGOON, { unsynced: [], owner: ALICE })
        updateAccountSettingsUseCase(LAGOON, { appearance: { family: "sand" } }, ALICE, store)
        const idp = fakeIdp({ ...LAGOON, notifications: { muteAll: false, muteAllUntil: null, mutedConversations: ["dm-1"] } })

        const settings = await syncAccountSettingsOnSignInUseCase(IDP, "tok", idp.document, ALICE, idp, store)

        const expected = {
            appearance: { family: "sand", motif: "raranga" },
            notifications: { muteAll: false, muteAllUntil: null, mutedConversations: ["dm-1"] },
        }
        expect(settings).toEqual(expected)
        expect(idp.document).toEqual(expected)
    })

    it("keeps the palette another device chose while this one had a mute to send", async () => {
        store.writeAccount(LAGOON, { unsynced: [], owner: ALICE })
        updateAccountSettingsUseCase(LAGOON, { notifications: { muteAll: true } }, ALICE, store)
        const idp = fakeIdp(SAND)

        const settings = await syncAccountSettingsOnSignInUseCase(IDP, "tok", idp.document, ALICE, idp, store)

        expect(settings).toEqual({ appearance: SAND.appearance, notifications: { muteAll: true, muteAllUntil: null, mutedConversations: [] } })
    })

    it("sends the palette change a copy saved before sections were tracked still holds", async () => {
        localStorage.setItem(
            ACCOUNT_SETTINGS_KEY,
            JSON.stringify({ version: 1, appearance: LAGOON.appearance, synced: false, owner: ALICE }),
        )
        const idp = fakeIdp(SAND)

        const settings = await syncAccountSettingsOnSignInUseCase(IDP, "tok", idp.document, ALICE, idp, store)

        expect(settings.appearance).toEqual(LAGOON.appearance)
    })

    it("carries a conversation muted on one device to the account's other devices", async () => {
        store.writeAccount(LAGOON, { unsynced: [], owner: ALICE })
        const idp = fakeIdp(LAGOON)
        const mute = { notifications: setConversationMuted(LAGOON.notifications, "dm-1", true) }
        await pushAccountSettingsUseCase(IDP, "tok", updateAccountSettingsUseCase(LAGOON, mute, ALICE, store), ALICE, idp, store)

        localStorage.clear()
        const signingIn = await syncAccountSettingsOnSignInUseCase(IDP, "tok", idp.document, ALICE, idp, store)
        localStorage.clear()
        const alreadyOpen = receiveAccountSettingsUseCase(idp.document, ALICE, store)

        for (const settings of [signingIn, alreadyOpen!]) {
            expect(isConversationMuted(settings.notifications, "dm-1")).toBe(true)
            expect(settings.appearance).toEqual(LAGOON.appearance)
        }
    })
})
