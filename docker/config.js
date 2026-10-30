// This deployment's settings, from the container's environment (presentation/_libs/deployment-config.ts).
window.PINAI_CONFIG = {
    klipyApiKey: {{env "KLIPY_API_KEY" | toJson}},
}
