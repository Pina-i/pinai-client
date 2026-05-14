/**
 * Client-side cache of peer-IdP JWKS endpoints. Used by
 * `attestation-chain.adapter.ts` to verify the IdP signature on each
 * `LeafCredentialV1.idp_att` that surfaces in an MLS leaf credential.
 *
 * Storage: `localStorage`, keyed by issuer, 1-hour TTL.
 * Concurrency: in-flight fetches are deduped per issuer so a burst of
 * concurrent `getKey` calls only triggers one HTTP request.
 * Rotation: on signature-verify failure, callers `invalidate(issuer)` and
 * retry — that clears the cache + the in-flight tracker, forcing a fresh
 * JWKS fetch.
 */

import { base64urlToBytes } from "@/presentation/_libs/utils-bytes"

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
const STORAGE_PREFIX = "pinai.jwks."

/** Raw 32-byte Ed25519 public key. `null` when no matching `kid` exists. */
export type Ed25519PublicKey = Uint8Array

export class JwksCacheAdapter {
    private inflight = new Map<string, Promise<CachedJwks>>()

    async getKey(issuer: string, kid: string): Promise<Ed25519PublicKey | null> {
        const cached = await this.fetchOrLoad(issuer)
        const match = cached.keys.find((k) => k.kid === kid)
        if (!match || match.kty !== "OKP" || match.crv !== "Ed25519" || !match.x) {
            return null
        }
        return base64urlToBytes(match.x)
    }

    invalidate(issuer: string): void {
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
        let pending = this.inflight.get(issuer)
        if (!pending) {
            pending = this.fetchAndStore(issuer)
            this.inflight.set(issuer, pending)
            void pending.finally(() => this.inflight.delete(issuer))
        }
        return pending
    }

    private async fetchAndStore(issuer: string): Promise<CachedJwks> {
        const url = `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`
        const res = await fetch(url, { method: "GET", credentials: "omit" })
        if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`)
        const body = (await res.json()) as { keys: JwksKey[] }
        const cached: CachedJwks = { fetchedAt: Date.now(), keys: body.keys ?? [] }
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
