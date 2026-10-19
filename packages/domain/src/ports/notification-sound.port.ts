/**
 * The sound a message makes as it arrives. Whether it rings is the domain's
 * (`shouldPingForMessage`, `pingsAgain`); how it sounds is each platform's.
 */
export interface INotificationSoundPort {
    /** Tō‘ere, the slit drum: a direct or group message that should ring. */
    playDmReceived(): void
}
