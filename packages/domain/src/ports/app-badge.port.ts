/** The count on the app's own icon — the Dock's, the taskbar's. A browser tab has none. */
export interface IAppBadgePort {
    /** Shows `count` on the icon; 0 clears it. */
    setCount(count: number): Promise<void>
}
