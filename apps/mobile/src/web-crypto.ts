import { getRandomValues, randomUUID } from "expo-crypto"

// Hermes has no Web Crypto: the shared crypto code calls these two of it (SealedStorage mints a device id with
// `randomUUID`, @noble draws its randomness through `getRandomValues`).
const scope = globalThis as {
    crypto?: { randomUUID?: () => string; getRandomValues?: typeof getRandomValues }
}
scope.crypto ??= {}
scope.crypto.randomUUID ??= randomUUID
scope.crypto.getRandomValues ??= getRandomValues
