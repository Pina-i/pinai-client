/** The caller's sessions on its IdP: which device each signed in, and the others signed out. */
export interface ISessionPort {
    /**
     * Name the E2EE device this session signed in, so revoking the device signs it out. `signature`
     * is the device's root key over `PINAI-SESSION-DEVICE-v1` for this session: a password alone
     * names no device. Refused (`IdpError` 403) for a device that isn't the account's, or is
     * revoked; `device_proof_invalid` for a proof the IdP can't check against the root key it holds.
     */
    linkDevice(idpUrl: string, accessToken: string, deviceId: string, signature: Uint8Array): Promise<void>

    /** End every session of the account but this one: other browsers, other apps. */
    signOutOtherDevices(idpUrl: string, accessToken: string): Promise<void>
}
