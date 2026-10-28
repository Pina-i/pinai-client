import { instanceAddress, type InstanceInfo } from "../../models/instance"
import { managesInstance } from "../../models/instance-admin"
import type { INodeInfoPort } from "../../ports/instance.port"
import { resolveInstanceUseCase } from "./resolve-instance.usecase"

/**
 * The instance at `idpUrl` as its admin manages it in Settings → Instance, or `null` when there is
 * no such panel: not an admin, or no Pīna'i identity provider there. NodeInfo is read only for an
 * admin.
 */
export async function managedInstanceUseCase(
    idpUrl: string,
    admin: boolean,
    nodeInfo: INodeInfoPort,
): Promise<InstanceInfo | null> {
    const address = instanceAddress(idpUrl)
    if (!admin || !address) return null
    const info = await resolveInstanceUseCase(address, nodeInfo)
    return managesInstance(admin, info) ? info : null
}
