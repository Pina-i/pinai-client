// This deployment's settings, from the container's environment (presentation/_libs/deployment-config.ts).
window.PINAI_CONFIG = {
    defaultIdpUrl: {{env "DEFAULT_IDP_URL" | toJson}},
    klipyApiKey: {{env "KLIPY_API_KEY" | toJson}},
}
