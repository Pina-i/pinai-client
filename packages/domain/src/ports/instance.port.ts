/**
 * What an instance publishes about itself before anyone signs in: NodeInfo,
 * the fediverse's self-description. Reads return the raw JSON;
 * `nodeInfoHref` and `parseNodeInfo` own what counts as valid.
 */
export interface INodeInfoPort {
    /** `GET <origin>/.well-known/nodeinfo` — the links to the documents it serves. */
    links(origin: string): Promise<unknown>
    /** `GET <href>` — the document one of those links names. */
    document(href: string): Promise<unknown>
}

/**
 * The instances this device signed in to, as origins, newest first. Reads
 * return what was stored, unvalidated: `parseRecentInstances` cleans it.
 */
export interface IRecentInstancesPort {
    read(): unknown
    write(origins: string[]): void
}

/**
 * The address the user last submitted on the landing, as an origin, kept across sign-outs. Reads
 * return what was stored, unvalidated: `loadLastInstanceUseCase` cleans it.
 */
export interface ILastInstancePort {
    read(): unknown
    write(origin: string): void
}
