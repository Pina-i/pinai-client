import type { AuthPlatform, IAuthPort } from "@/domain/ports/auth.port"
import { startLoginUseCase } from "./startLogin.usecase"

/**
 * Ensures the current user is authenticated before accessing a protected route.
 *
 * - Already authenticated → returns immediately.
 * - Token gone but IdP URL known → triggers the OIDC flow. If the IdP session
 *   cookie is still valid the IdP skips the login form and redirects back
 *   silently (on the web, `startLoginUseCase` navigates away and never resolves).
 * - No IdP URL configured → throws so the caller can redirect to the landing page.
 *
 * Any error thrown by startLoginUseCase (IdP unreachable, discovery failure)
 * is left to propagate so the caller can handle it uniformly.
 */
export async function ensureAuthenticatedUseCase(
    isAuthenticated: boolean,
    idpUrl: string | null,
    authPort: IAuthPort,
    platform: AuthPlatform,
): Promise<void> {
    if (isAuthenticated) return

    if (!idpUrl) throw new Error("No identity provider configured")

    await startLoginUseCase(idpUrl, authPort, platform)
    // On the web this is unreachable: the document has already navigated away.
}
