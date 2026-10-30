import { instanceAddress, type InstanceAddress } from "../../models/instance"
import type { ILastInstancePort } from "../../ports/instance.port"

/** What the landing starts with, short of an arrival: the address last submitted, if still one. */
export function loadLastInstanceUseCase(store: ILastInstancePort): InstanceAddress | null {
    const stored = store.read()
    return typeof stored === "string" ? instanceAddress(stored) : null
}

/** On Continue, before the sign-in starts: one that fails keeps it too. */
export function rememberChosenInstanceUseCase(address: InstanceAddress, store: ILastInstancePort): void {
    store.write(address.origin)
}
