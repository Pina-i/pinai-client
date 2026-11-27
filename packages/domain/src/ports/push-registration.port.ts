/** Where the instance sends this device's push notices: the relay its app names, and the token the relay gave it. */
export interface PushRegistration {
    relay: string
    token: string
}

/**
 * This device's push registration on its instance (`identity-provider/specs/push.md`), from its own session only:
 * `IdpError` 403 `device_required` / `device_mismatch`, 403 revoked, 404.
 */
export interface IPushRegistrationPort {
    /** Replaces the one held: set again at each start, as the relay may hand out another token. */
    register(idpUrl: string, accessToken: string, deviceId: string, registration: PushRegistration): Promise<void>
    /** None held is fine too. */
    unregister(idpUrl: string, accessToken: string, deviceId: string): Promise<void>
}
