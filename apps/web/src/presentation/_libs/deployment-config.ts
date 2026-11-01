/**
 * What `/config.js` sets: the published image writes it from the container's environment, at each
 * request (`docker/config.js`). Nothing yet — a setting one deployment needs and another doesn't
 * goes here, read at load rather than built in, so one image serves every deployment. Settings an
 * instance decides (its GIF key) come from the instance, in its NodeInfo, never from here.
 */
export type DeploymentConfig = Record<string, never>

declare global {
    interface Window {
        PINAI_CONFIG?: DeploymentConfig
    }
}

export const DEPLOYMENT_CONFIG: DeploymentConfig = window.PINAI_CONFIG ?? {}
