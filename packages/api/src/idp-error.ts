import { HTTPError } from "ky"
import { IdpError } from "@pinai/domain/models/idp-error"

export function toIdpError(status: number, body: unknown, fallback: string): IdpError {
    const field = (name: string): string | null => {
        const value = body && typeof body === "object" ? (body as Record<string, unknown>)[name] : null
        return typeof value === "string" && value !== "" ? value : null
    }
    const code = field("error") ?? ""
    return new IdpError(
        status,
        code,
        field("error_description") ?? (code || `${fallback}: ${status}`),
        field("actor_uri"),
    )
}

/** For an adapter's `catch`: an HTTP refusal becomes an `IdpError`; anything else passes through. */
export async function idpErrorFrom(error: unknown, fallback: string): Promise<Error> {
    if (error instanceof HTTPError) {
        const body: unknown = await error.response.json().catch(() => null)
        return toIdpError(error.response.status, body, fallback)
    }
    return error instanceof Error ? error : new Error(fallback)
}
