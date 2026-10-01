import type { BlockedActorEntry, ContactPolicy } from "../models/block"

/** Who may reach the account: its blocks and its contact setting. */
export interface IPrivacyPort {
    /** The people the account blocked, newest first. */
    listBlocks(idpUrl: string, accessToken: string): Promise<BlockedActorEntry[]>
    /** Block someone: it ends any friendship with them. Blocking again changes nothing. */
    block(idpUrl: string, accessToken: string, actorUri: string): Promise<void>
    /** Lift a block, and nothing else: an ended friendship stays ended. */
    unblock(idpUrl: string, accessToken: string, actorUri: string): Promise<void>
    /** Answers the setting as saved. */
    setContactPolicy(idpUrl: string, accessToken: string, policy: ContactPolicy): Promise<ContactPolicy>
}
