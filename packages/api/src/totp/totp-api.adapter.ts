import { idp } from "../http"
import { idpErrorFrom } from "../idp-error"
import type {
    ITotpPort,
    TotpEnrollResponse,
    TotpEnrollVerifyResponse,
} from "@pinai/domain/ports/totp.port"

function base(idpUrl: string): string {
    return idpUrl.replace(/\/$/, "")
}

export class TotpApiAdapter implements ITotpPort {
    async startEnrollment(idpUrl: string, accessToken: string): Promise<TotpEnrollResponse> {
        try {
            return await idp
                .post(`${base(idpUrl)}/api/totp/enroll`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                })
                .json<TotpEnrollResponse>()
        } catch (e) {
            throw await idpErrorFrom(e, "TOTP enrollment failed")
        }
    }

    async verifyEnrollment(
        idpUrl: string,
        accessToken: string,
        code: string,
    ): Promise<TotpEnrollVerifyResponse> {
        try {
            return await idp
                .post(`${base(idpUrl)}/api/totp/enroll/verify`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    json: { code },
                })
                .json<TotpEnrollVerifyResponse>()
        } catch (e) {
            throw await idpErrorFrom(e, "TOTP verification failed")
        }
    }

    async disable(idpUrl: string, accessToken: string, code: string): Promise<void> {
        try {
            await idp.post(`${base(idpUrl)}/api/totp/disable`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { code },
            })
        } catch (e) {
            throw await idpErrorFrom(e, "Failed to disable TOTP")
        }
    }

    async regenerateRecoveryCodes(
        idpUrl: string,
        accessToken: string,
        code: string,
    ): Promise<TotpEnrollVerifyResponse> {
        try {
            return await idp
                .post(`${base(idpUrl)}/api/totp/recovery-codes/regenerate`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    json: { code },
                })
                .json<TotpEnrollVerifyResponse>()
        } catch (e) {
            throw await idpErrorFrom(e, "Failed to regenerate recovery codes")
        }
    }
}
