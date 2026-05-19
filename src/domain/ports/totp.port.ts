export interface TotpEnrollResponse {
    secret_base32: string
    provisioning_url: string
}

export interface TotpEnrollVerifyResponse {
    recovery_codes: string[]
}

export interface ITotpPort {
    /** Start enrollment: server mints a fresh secret and returns its QR URL. */
    startEnrollment(idpUrl: string, accessToken: string): Promise<TotpEnrollResponse>

    /** Verify the first authenticator code, commit the secret, return one-time recovery codes. */
    verifyEnrollment(
        idpUrl: string,
        accessToken: string,
        code: string,
    ): Promise<TotpEnrollVerifyResponse>

    /** Disable TOTP for the current user — requires a current authenticator code. */
    disable(idpUrl: string, accessToken: string, code: string): Promise<void>

    /** Replace the user's recovery codes — requires a current authenticator code. */
    regenerateRecoveryCodes(
        idpUrl: string,
        accessToken: string,
        code: string,
    ): Promise<TotpEnrollVerifyResponse>
}
