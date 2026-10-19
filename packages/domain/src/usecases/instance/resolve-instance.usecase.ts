import { nodeInfoHref, parseNodeInfo, type InstanceAddress, type InstanceInfo } from "../../models/instance"
import type { INodeInfoPort } from "../../ports/instance.port"

/**
 * What the instance at `address` says about itself, or `null` when it isn't a
 * Pīna'i identity provider. A network failure rejects.
 */
export async function resolveInstanceUseCase(
    address: InstanceAddress,
    nodeInfo: INodeInfoPort,
): Promise<InstanceInfo | null> {
    const href = nodeInfoHref(await nodeInfo.links(address.origin), address.origin)
    if (!href) return null
    return parseNodeInfo(await nodeInfo.document(href), address)
}
