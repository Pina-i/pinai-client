/** The caller's sessions on its IdP: which device each signed in, and the others signed out. */
export interface ISessionPort {
    /**
     * Name the E2EE device this session signed in, so revoking the device signs it out. Refused
     * (`IdpError` 403) for a device that isn't the account's, or is revoked.
     */
    linkDevice(idpUrl: string, accessToken: string, deviceId: string): Promise<void>

    /** End every session of the account but this one: other browsers, other apps. */
    signOutOtherDevices(idpUrl: string, accessToken: string): Promise<void>
}
