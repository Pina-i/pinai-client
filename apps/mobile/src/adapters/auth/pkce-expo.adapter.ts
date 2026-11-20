import { bytesToBase64url } from "@pinai/domain/lib/bytes"
import type { IPkcePort } from "@pinai/domain/ports/auth.port"

/** What PKCE takes from the platform's crypto: `expo-crypto` on the phone. */
export interface PkceCrypto {
    getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>
    sha256(data: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer>
}

export class ExpoPkceAdapter implements IPkcePort {
    private readonly crypto: PkceCrypto

    constructor(crypto: PkceCrypto) {
        this.crypto = crypto
    }

    generateCodeVerifier(): string {
        return this.generateRandomString(48)
    }

    async computeCodeChallenge(verifier: string): Promise<string> {
        return bytesToBase64url(new Uint8Array(await this.crypto.sha256(new TextEncoder().encode(verifier))))
    }

    generateRandomString(byteLength: number): string {
        return bytesToBase64url(this.crypto.getRandomValues(new Uint8Array(byteLength)))
    }
}
