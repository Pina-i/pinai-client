// A local program starting the app to drive it, log or intercept its traffic would get the bridge, and the user's access tokens.
const DRIVING_SWITCHES = [
    "remote-debugging-port",
    "remote-debugging-pipe",
    "log-net-log",
    "ssl-key-log-file",
    "ignore-certificate-errors",
    "ignore-certificate-errors-spki-list",
]

/** Whether the app refuses to start: packaged, and asked to open itself to a debugger or a traffic capture. */
export function refusesToStart(
    isPackaged: boolean,
    hasSwitch: (name: string) => boolean,
    env: Record<string, string | undefined> = process.env,
): boolean {
    return isPackaged && (DRIVING_SWITCHES.some(hasSwitch) || Boolean(env.SSLKEYLOGFILE))
}
