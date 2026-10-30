/** What `/config.js` sets: the published image writes it from the container's environment. */
interface DeploymentConfig {
    klipyApiKey?: string
}

declare global {
    interface Window {
        PINAI_CONFIG?: DeploymentConfig
    }
}

// Read at load rather than built in, so one image serves every deployment.
const deployed: DeploymentConfig = window.PINAI_CONFIG ?? {}

/** Enables the GIF picker; empty leaves it off. */
export const KLIPY_API_KEY =
    deployed.klipyApiKey ?? (import.meta.env.VITE_KLIPY_API_KEY as string | undefined) ?? ""
