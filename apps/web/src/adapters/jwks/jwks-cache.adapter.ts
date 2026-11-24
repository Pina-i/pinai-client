import { JwksCache } from "@pinai/api/e2ee/jwks-cache.adapter"

export type { Ed25519PublicKey } from "@pinai/domain/ports/jwks-cache.port"

// Read at each call: a test or a private window may swap or refuse it.
const webStorage = {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => localStorage.setItem(key, value),
    removeItem: (key: string) => localStorage.removeItem(key),
}

/** The shared JWKS cache over this page's `localStorage`. */
export class JwksCacheAdapter extends JwksCache {
    constructor() {
        super(webStorage)
    }
}
