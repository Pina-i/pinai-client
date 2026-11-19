import type { BrowserFacts, ChromiumHints } from "@pinai/domain/models/device-label"
import type { GatheredFacts, IDeviceFactsPort } from "@pinai/domain/ports/device-facts.port"

/** Long enough for Chromium's answer, short enough that a registration never waits on it. */
export const HINTS_TIMEOUT_MS = 500

const LATE = Symbol("late")

interface UserAgentDataValues {
    mobile?: boolean
    model?: string
    platformVersion?: string
}

/** `navigator.userAgentData`: Chromium only, absent from TypeScript's DOM types. */
interface UserAgentData {
    mobile: boolean
    getHighEntropyValues(hints: string[]): Promise<UserAgentDataValues>
}

export interface NavigatorFacts {
    userAgent: string
    userAgentData?: UserAgentData
}

/** {@link IDeviceFactsPort} for a browser: its `User-Agent`, and Chromium's hints when they come in time. */
export class BrowserDeviceFactsAdapter implements IDeviceFactsPort {
    private readonly navigator: NavigatorFacts
    private readonly timeoutMs: number

    constructor(navigator: NavigatorFacts, timeoutMs = HINTS_TIMEOUT_MS) {
        this.navigator = navigator
        this.timeoutMs = timeoutMs
    }

    known(): BrowserFacts {
        return { client: "browser", userAgent: this.navigator.userAgent ?? "", hints: null }
    }

    async gather(): Promise<GatheredFacts<BrowserFacts>> {
        const { hints, late } = await this.hints()
        return { facts: { ...this.known(), hints }, late }
    }

    private async hints(): Promise<{ hints: ChromiumHints | null; late: boolean }> {
        const data = this.navigator.userAgentData
        if (typeof data?.getHighEntropyValues !== "function") return { hints: null, late: false }
        let timer: ReturnType<typeof setTimeout> | undefined
        const late = new Promise<typeof LATE>((resolve) => {
            timer = setTimeout(() => resolve(LATE), this.timeoutMs)
        })
        try {
            const values = await Promise.race([data.getHighEntropyValues(["model", "platformVersion"]), late])
            if (values === LATE) return { hints: null, late: true }
            const hints = {
                mobile: values.mobile ?? data.mobile,
                model: typeof values.model === "string" ? values.model : "",
                platformVersion: typeof values.platformVersion === "string" ? values.platformVersion : "",
            }
            return { hints, late: false }
        } catch {
            return { hints: null, late: false }
        } finally {
            clearTimeout(timer)
        }
    }
}
