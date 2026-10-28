/** What `/config.js` sets: the published image writes it from the container's environment. */
interface DeploymentConfig {
    defaultIdpUrl?: string
    klipyApiKey?: string
}

declare global {
    interface Window {
        PINAI_CONFIG?: DeploymentConfig
    }
}

// Read at load rather than built in, so one image serves every deployment.
const deployed: DeploymentConfig = window.PINAI_CONFIG ?? {}

/** The instance the landing offers before the device has signed in anywhere; empty offers none. */
export const DEFAULT_IDP_URL =
    deployed.defaultIdpUrl ?? import.meta.env.VITE_DEFAULT_IDP_URL ?? "http://localhost:8088"

/** Enables the GIF picker; empty leaves it off. */
export const KLIPY_API_KEY =
    deployed.klipyApiKey ?? (import.meta.env.VITE_KLIPY_API_KEY as string | undefined) ?? ""
