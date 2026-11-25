import type { DevicesFromBefore } from "@pinai/domain/usecases/e2ee/devices-from-before.usecase"

// The phone answers no code yet: a device left behind comes back with the new words.
const BACK = `open Pīna'i on it, choose "It was me" if it shows a banner, then type these words there`
const LOST = "sign it out in Settings → Devices on the web or the desktop app: a device you've lost still shows your conversations until you sign it out"

/** The devices the new words left behind, named, and how each comes back or goes. */
export function fromBeforeLine({ cause, labels }: DevicesFromBefore): string {
    const named = labels.join(", ")
    const one = labels.length === 1
    const who =
        cause === "replacement"
            ? one
                ? `Your other device (${named}) needs the new words.`
                : `Your other devices (${named}) need the new words.`
            : one
              ? `Your device from before (${named}) is no longer approved.`
              : `Your devices from before (${named}) are no longer approved.`
    return one ? `${who} If you still have it, ${BACK}. If you've lost it, ${LOST}.` : `${who} If you still have one, ${BACK}. If you've lost one, ${LOST}.`
}
