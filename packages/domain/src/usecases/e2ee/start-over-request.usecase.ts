import { mayAnswer } from "../../models/approval-handshake"
import type { ActorUri } from "../../models/e2ee"
import {
    askRefusal,
    endedAlready,
    readsElsewhere,
    requestToPrompt,
    type AskRefusal,
    type StartOverRead,
    type StartOverRequest,
} from "../../models/start-over"
import type { IE2eePort } from "../../ports/e2ee.port"
import type { ISessionPort } from "../../ports/session.port"
import type { IStartOverPort } from "../../ports/start-over.port"

import { setUpThisDeviceUseCase } from "./set-up-this-device.usecase"

export type StartOverAsk =
    /** Asked, or this device's open request answered again. */
    | { kind: "asked"; request: StartOverRequest }
    /** `not-needed`: approved under the key in force, or no key: it sets the next generation itself. */
    | { kind: AskRefusal }

/** Asking takes a session that named its device, so the device is set up first. Nothing is erased yet. */
export function askToStartOverUseCase(deps: { e2eePort: IE2eePort; sessionPort: ISessionPort; startOverPort: IStartOverPort }) {
    return async (idpUrl: string, accessToken: string, actorUri: ActorUri): Promise<StartOverAsk> => {
        await setUpThisDeviceUseCase(deps)(idpUrl, accessToken, actorUri)
        try {
            const asked = await deps.startOverPort.ask(idpUrl, accessToken)
            const deviceId = await deps.e2eePort.getDeviceId()
            return { kind: "asked", request: { ...asked, deviceId, displayName: "", ended: null } }
        } catch (error) {
            const refused = askRefusal(error)
            if (!refused) throw error
            return { kind: refused }
        }
    }
}

/** `GET /api/history/start-over` as a device reads it: another device's request it may not read is `elsewhere`. */
export function readStartOverUseCase(deps: { startOverPort: IStartOverPort }) {
    return async (idpUrl: string, accessToken: string): Promise<StartOverRead> => {
        try {
            const request = await deps.startOverPort.read(idpUrl, accessToken)
            return request ? { kind: "request", request } : { kind: "none" }
        } catch (error) {
            if (readsElsewhere(error)) return { kind: "elsewhere" }
            throw error
        }
    }
}

/** The request to prompt about (`requestToPrompt`), and whether this device can approve its asker with a code instead. */
export interface StartOverPrompt {
    request: StartOverRequest
    answersCodes: boolean
}

/**
 * Whatever this device last found of itself: a stale or unreadable check must never hide the
 * warning, and the IdP shows the request only to the devices that may cancel it.
 */
export function startOverToPromptUseCase(deps: { e2eePort: IE2eePort; startOverPort: IStartOverPort }) {
    return async (idpUrl: string, accessToken: string): Promise<StartOverPrompt | null> => {
        const read = await readStartOverUseCase(deps)(idpUrl, accessToken)
        const request = requestToPrompt(read, await deps.e2eePort.getDeviceId())
        if (!request) return null
        const standing = await deps.e2eePort.historyKeyStanding().catch(() => null)
        return { request, answersCodes: standing !== null && mayAnswer(standing) }
    }
}

/** Cancelled from an approved device, withdrawn by its asker; `gone` when it had ended already, or is unknown. */
export function endStartOverUseCase(deps: { startOverPort: IStartOverPort }) {
    return async (idpUrl: string, accessToken: string, requestId: string): Promise<"ended" | "gone"> => {
        try {
            await deps.startOverPort.end(idpUrl, accessToken, requestId)
            return "ended"
        } catch (error) {
            if (endedAlready(error)) return "gone"
            throw error
        }
    }
}
