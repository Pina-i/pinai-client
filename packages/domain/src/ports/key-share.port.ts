import type { KeyShare, OutgoingKeyShare } from "../models/key-share"

/** `/api/history/key-shares` (`identity-provider/specs/e2ee.md § 5`, "History backup"). Every refusal is an `IdpError`. */
export interface IKeySharePort {
    /** From the session's device, which the share is signed by. `204`, a share held already included. */
    share(idpUrl: string, accessToken: string, share: OutgoingKeyShare): Promise<void>
    /** The share waiting for the session's device under the current generation; `null` when none waits. */
    waiting(idpUrl: string, accessToken: string): Promise<KeyShare | null>
}
