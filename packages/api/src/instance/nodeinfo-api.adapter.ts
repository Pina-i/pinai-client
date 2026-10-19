import ky from "ky"
import type { INodeInfoPort } from "@pinai/domain/ports/instance.port"

// Read while the user types: an instance slower than this reads as unreachable.
const TIMEOUT_MS = 5_000

export class NodeInfoApiAdapter implements INodeInfoPort {
    links(origin: string): Promise<unknown> {
        return ky.get(`${origin.replace(/\/$/, "")}/.well-known/nodeinfo`, { timeout: TIMEOUT_MS, retry: 0 }).json<unknown>()
    }

    document(href: string): Promise<unknown> {
        return ky.get(href, { timeout: TIMEOUT_MS, retry: 0 }).json<unknown>()
    }
}
