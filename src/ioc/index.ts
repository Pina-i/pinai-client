import { OidcAdapter } from "@/adapters/auth/oidc.adapter"
import type { IAuthPort } from "@/domain/ports/auth.port"

/**
 * Singleton instances.
 * Replace with tsyringe container when DI is added.
 */
const authPort: IAuthPort = new OidcAdapter()

export function getAuthPort(): IAuthPort {
    return authPort
}
