/** A status the user chose survives a reconnect: the IdP sets an automatic one on each new connection. */
import { describe, expect, it, vi } from "vitest"

import type { IWsPort } from "@pinai/domain/ports/ws.port"
import { restatePresenceUseCase } from "@pinai/domain/usecases/presence/restate-presence.usecase"

function socket() {
    const send = vi.fn()
    return { port: { send } as unknown as IWsPort, send }
}

describe("restatePresenceUseCase", () => {
    it("tells the IdP again the status the user chose", () => {
        const { port, send } = socket()
        restatePresenceUseCase(port, "dnd")
        restatePresenceUseCase(port, "invisible")

        expect(send.mock.calls).toEqual([
            [{ type: "set_presence", data: { state: "dnd" } }],
            [{ type: "set_presence", data: { state: "offline" } }],
        ])
    })

    it("sends nothing for online: the IdP's own reading of the connection is it", () => {
        const { port, send } = socket()
        restatePresenceUseCase(port, "online")

        expect(send).not.toHaveBeenCalled()
    })
})
