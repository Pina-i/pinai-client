import ky, { HTTPError } from "ky"
import type {
    ITotpPort,
    TotpEnrollResponse,
    TotpEnrollVerifyResponse,
} from "@/domain/ports/totp.port"

function base(idpUrl: string): string {
    return idpUrl.replace(/\/$/, "")
}

async function readError(error: unknown, fallback: string): Promise<Error> {
    if (error instanceof HTTPError) {
        const body = (await error.response.json().catch(() => ({}))) as {
            error?: string
            error_description?: string
        }
        return new Error(
            body.error_description ?? body.error ?? `${fallback}: ${error.response.status}`,
        )
    }
    return error instanceof Error ? error : new Error(fallback)
}

export class TotpApiAdapter implements ITotpPort {
    async startEnrollment(idpUrl: string, accessToken: string): Promise<TotpEnrollResponse> {
        try {
            return await ky
                .post(`${base(idpUrl)}/api/totp/enroll`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                })
                .json<TotpEnrollResponse>()
        } catch (e) {
            throw await readError(e, "TOTP enrollment failed")
        }
    }

    async verifyEnrollment(
        idpUrl: string,
        accessToken: string,
        code: string,
    ): Promise<TotpEnrollVerifyResponse> {
        try {
            return await ky
                .post(`${base(idpUrl)}/api/totp/enroll/verify`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    json: { code },
                })
                .json<TotpEnrollVerifyResponse>()
        } catch (e) {
            throw await readError(e, "TOTP verification failed")
        }
    }

    async disable(idpUrl: string, accessToken: string, code: string): Promise<void> {
        try {
            await ky.post(`${base(idpUrl)}/api/totp/disable`, {
                headers: { Authorization: `Bearer ${accessToken}` },
                json: { code },
            })
        } catch (e) {
            throw await readError(e, "Failed to disable TOTP")
        }
    }

    async regenerateRecoveryCodes(
        idpUrl: string,
        accessToken: string,
        code: string,
    ): Promise<TotpEnrollVerifyResponse> {
        try {
            return await ky
                .post(`${base(idpUrl)}/api/totp/recovery-codes/regenerate`, {
                    headers: { Authorization: `Bearer ${accessToken}` },
                    json: { code },
                })
                .json<TotpEnrollVerifyResponse>()
        } catch (e) {
            throw await readError(e, "Failed to regenerate recovery codes")
        }
    }
}
