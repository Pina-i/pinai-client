import { composeDeviceLabel, type DeviceLabel } from "../../models/device-label"
import type { IDeviceFactsPort } from "../../ports/device-facts.port"

export interface ThisDeviceLabel {
    /** The label from what is known now: the facts gathered once they are, else what is known at once. */
    now(): DeviceLabel
    /** The label from every fact the platform gave; gathered once a run, again while it answered late. */
    settled(): Promise<DeviceLabel>
}

export function thisDeviceLabel(facts: IDeviceFactsPort): ThisDeviceLabel {
    let settled: DeviceLabel | null = null
    let gathering: Promise<DeviceLabel> | null = null
    const gather = async (): Promise<DeviceLabel> => {
        const gathered = await facts.gather().catch(() => ({ facts: facts.known(), late: true }))
        const label = composeDeviceLabel(gathered.facts)
        // Kept, a late answer's base name would overwrite the better one the IdP holds at every request.
        if (gathered.late) gathering = null
        else settled = label
        return label
    }
    return {
        now: () => settled ?? composeDeviceLabel(facts.known()),
        settled: () => (gathering ??= gather()),
    }
}
