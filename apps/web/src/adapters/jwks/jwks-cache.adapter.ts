/**
 * Per-issuer JWKS cache used by attestation-chain verification.
 * localStorage with a 1-hour TTL; in-flight fetches deduped; callers
 * `invalidate(issuer)` then retry on signature-verify failure for
 * rotation safety — keys under a minute old are kept. A fetch gives up
 * after 10 s, and an issuer that failed fails at once for a minute.
 */

import { base64urlToBytes } from "@pinai/domain/lib/bytes"
import type { Ed25519PublicKey, IJwksCachePort } from "@pinai/domain/ports/jwks-cache.port"

interface JwksKey {
    kty: string
    crv?: string
    alg?: string
    kid: string
    x?: string
}

interface CachedJwks {
    fetchedAt: number
    keys: JwksKey[]
}

const TTL_MS = 60 * 60 * 1000 // 1 hour
/** Keys fetched more recently would come back the same; an issuer that failed is asked again after it too. */
const REFETCH_AFTER_MS = 60 * 1000
const FETCH_TIMEOUT_MS = 10 * 1000
const STORAGE_PREFIX = "pinai.jwks."

/** Raw 32-byte Ed25519 public key. `null` when no matching `kid` exists. */
export type { Ed25519PublicKey } from "@pinai/domain/ports/jwks-cache.port"

export class JwksCacheAdapter implements IJwksCachePort {
    private inflight = new Map<string, Promise<CachedJwks>>()
    private readonly fetchedAt = new Map<string, number>()
    private readonly failedAt = new Map<string, number>()

    async getKey(issuer: string, kid: string): Promise<Ed25519PublicKey | null> {
        const cached = await this.fetchOrLoad(issuer)
        const match = cached.keys.find((k) => k.kid === kid)
        if (!match || match.kty !== "OKP" || match.crv !== "Ed25519" || !match.x) {
            return null
        }
        return base64urlToBytes(match.x)
    }

    invalidate(issuer: string): void {
        // Leaves with forged signatures must not make the client hammer an honest issuer.
        if (Date.now() - (this.fetchedAt.get(issuer) ?? 0) < REFETCH_AFTER_MS) return
        try {
            localStorage.removeItem(STORAGE_PREFIX + issuer)
        } catch {
            // localStorage may be unavailable in some test envs — silent
        }
        this.inflight.delete(issuer)
    }

    private async fetchOrLoad(issuer: string): Promise<CachedJwks> {
        const fromStorage = this.readFromStorage(issuer)
        if (fromStorage && Date.now() - fromStorage.fetchedAt < TTL_MS) {
            return fromStorage
        }
        // A hanging or failing issuer holds up the group queue each leaf of its is checked in.
        if (Date.now() - (this.failedAt.get(issuer) ?? -Infinity) < REFETCH_AFTER_MS) {
            throw new Error(`JWKS of ${issuer} unreachable a moment ago`)
        }
        let pending = this.inflight.get(issuer)
        if (!pending) {
            pending = this.fetchAndStore(issuer)
            this.inflight.set(issuer, pending)
            void pending.finally(() => this.inflight.delete(issuer)).catch(() => undefined)
        }
        return pending
    }

    private async fetchAndStore(issuer: string): Promise<CachedJwks> {
        const url = `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`
        let body: { keys: JwksKey[] }
        try {
            const res = await fetch(url, {
                method: "GET",
                credentials: "omit",
                signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            })
            if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
            body = (await res.json()) as { keys: JwksKey[] }
        } catch (error) {
            this.failedAt.set(issuer, Date.now())
            throw error
        }
        this.failedAt.delete(issuer)
        const cached: CachedJwks = { fetchedAt: Date.now(), keys: body.keys ?? [] }
        this.fetchedAt.set(issuer, cached.fetchedAt)
        try {
            localStorage.setItem(STORAGE_PREFIX + issuer, JSON.stringify(cached))
        } catch {
            // storage quota / unavailable — proceed without persistence
        }
        return cached
    }

    private readFromStorage(issuer: string): CachedJwks | null {
        try {
            const raw = localStorage.getItem(STORAGE_PREFIX + issuer)
            if (!raw) return null
            return JSON.parse(raw) as CachedJwks
        } catch {
            return null
        }
    }
}
