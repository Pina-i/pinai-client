import {
    addRecentInstance,
    instanceAddress,
    parseRecentInstances,
    type InstanceAddress,
} from "../../models/instance"
import type { IRecentInstancesPort } from "../../ports/instance.port"

export function loadRecentInstancesUseCase(store: IRecentInstancesPort): InstanceAddress[] {
    return parseRecentInstances(store.read())
}

/** After a sign-in to `idpUrl` succeeded. */
export function rememberInstanceUseCase(idpUrl: string, store: IRecentInstancesPort): void {
    const address = instanceAddress(idpUrl)
    if (!address) return
    const recent = addRecentInstance(parseRecentInstances(store.read()), address)
    store.write(recent.map((known) => known.origin))
}
