import { nodeInfoKlipyKey } from "../../models/gif-search"
import { instanceAddress, nodeInfoHref } from "../../models/instance"
import type { INodeInfoPort } from "../../ports/instance.port"

/**
 * The Klipy key the GIF picker searches with for someone signed in to `idpUrl`: the one its
 * NodeInfo hands out, `null` when it hands out none. A failed read rejects, so the caller can try
 * again rather than take the instance for one without GIFs.
 */
export async function gifSearchKeyUseCase(idpUrl: string, nodeInfo: INodeInfoPort): Promise<string | null> {
    const address = instanceAddress(idpUrl)
    if (!address) return null
    const href = nodeInfoHref(await nodeInfo.links(address.origin), address.origin)
    return href ? nodeInfoKlipyKey(await nodeInfo.document(href)) : null
}
