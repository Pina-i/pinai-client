import { desktopOsOf, type AppFacts, type ComputerFacts, type DesktopOs } from "@pinai/domain/models/device-label"
import type { GatheredFacts, IDeviceFactsPort } from "@pinai/domain/ports/device-facts.port"

import type { DesktopBridge } from "./desktop-bridge"

/** {@link IDeviceFactsPort} for the desktop app: the computer's facts, from its main process. */
export class DesktopDeviceFactsAdapter implements IDeviceFactsPort {
    private readonly bridge: DesktopBridge
    private readonly userAgent: string

    constructor(bridge: DesktopBridge, userAgent: string) {
        this.bridge = bridge
        this.userAgent = userAgent
    }

    known(): AppFacts {
        return { client: "app", os: desktopOsOf(this.userAgent), model: null, computerName: null }
    }

    async gather(): Promise<GatheredFacts<AppFacts>> {
        const known = this.known()
        try {
            const answer: unknown = await this.bridge.device.facts()
            const row: Record<string, unknown> = isRow(answer) ? answer : {}
            return { facts: { client: "app", ...computerFacts(row.facts, known.os) }, late: row.late === true }
        } catch {
            return { facts: known, late: true }
        }
    }
}

function isRow(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function computerFacts(read: unknown, os: DesktopOs): ComputerFacts {
    const row = isRow(read) ? read : {}
    const text = (value: unknown) => (typeof value === "string" ? value : null)
    return {
        os: row.os === "macOS" || row.os === "Windows" || row.os === "Linux" ? row.os : os,
        model: text(row.model),
        computerName: text(row.computerName),
    }
}
