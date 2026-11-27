import { APPROVAL_REQUIRED, DEVICE_MISMATCH, IdpError, isUnreachable } from "@pinai/domain/models/idp-error"

/** Why this device starts over: no way in left, the reset wasn't the user's, the password changed since, or the instance changed the key. */
export type StartOverReason = "lost-everything" | "not-me" | "password-changed" | "unknown-change"

/** What went otherwise than asked, for the page to say before it checks again. */
export type StartOverNotice = "conflict" | "key-changed" | "approved" | "superseded"

export const START_OVER_NOTICES: Record<StartOverNotice, string> = {
    "conflict": "Another of your devices set a new passphrase at the same moment, so this one didn't start over.",
    "key-changed": "This device started over, then another of your devices set a newer passphrase: its words are the ones now.",
    "approved": "Another of your devices approved this one, so it doesn't need to start over.",
    "superseded": "One of your approved devices set new words, which ended your request to start over.",
}

const STAYS =
    "Your saved history is erased, and this device won't see your existing conversations unless a device you still have comes back: it will warn you, and can come back with a code typed here. Your account, your friends and new conversations stay."
const WAITS = "Your approved devices, if any, are told first: you finish here once none of them has been used for 7 days."

/** The setter, by its name when this device found it approved. */
export function setterOf(reason: StartOverReason, replacedOn: string | null): string {
    return replacedOn ?? (reason === "not-me" ? "the device that replaced your words" : "the device that reset your history")
}

/** The choice: what starting over does, for the reason it's offered. */
export function choiceText(reason: StartOverReason, replacedOn: string | null): { eyebrow: string; heading: string; body: string } {
    switch (reason) {
        case "lost-everything":
            return {
                eyebrow: "Start over",
                heading: "No device and no words?",
                body: `This device gets new words and becomes your reference. Your saved history is erased; your account, friends and new conversations stay. ${WAITS}`,
            }
        case "not-me":
            return {
                eyebrow: "Start over from here",
                heading: "It wasn't me",
                body: replacedOn
                    ? `Then someone else replaced your words on ${replacedOn}: it won't be approved, and once this device has started over, it can sign ${replacedOn} out. This device gets a new passphrase and becomes your reference instead. ${STAYS} ${WAITS}`
                    : `Then the device that reset your history isn't yours, and it won't be approved. This device gets a new passphrase and becomes your reference instead. ${STAYS} ${WAITS}`,
            }
        case "password-changed":
            return {
                eyebrow: "Then, start over",
                heading: "Make this device your reference",
                body: `The device that reset your history isn't yours: it won't be approved. This device gets a new passphrase and becomes your reference instead. ${STAYS} ${WAITS}`,
            }
        case "unknown-change":
            return {
                eyebrow: "Start over from here",
                heading: "Make this device your reference",
                body: `This device gets a new passphrase and becomes your reference, whatever your instance changed. ${STAYS} ${WAITS}`,
            }
    }
}

/** How this device's last request ended, when that is worth saying. */
export function endedLine(ended: "cancelled" | "superseded" | null, reason: StartOverReason, replacedOn: string | null): string | null {
    if (ended === "superseded") return START_OVER_NOTICES.superseded
    if (ended !== "cancelled") return null
    return reason === "not-me" || reason === "password-changed"
        ? `Your request to start over was cancelled. Whoever has ${setterOf(reason, replacedOn)} has your password: change it first, then ask again.`
        : "One of your devices cancelled your request to start over. If you have that device, approve this one with a code from it instead."
}

/** The way back offered beside a request: a code from a device still held. */
export function insteadLine(reason: StartOverReason, replacedOn: string | null): string {
    return reason === "not-me"
        ? `If it was you after all, approving this device with a code from ${setterOf(reason, replacedOn)} keeps your history.`
        : "Still have one of your devices? Approving this one with a code from it is quicker, and keeps your history."
}

export const TOO_MANY = "Three requests to start over were made on this account today. Try again tomorrow."

/** "Friday 13 November, 10:00", in the phone's language. */
export function momentLabel(at: number): string {
    return new Date(at).toLocaleString(undefined, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })
}

/** A start over request's refusal, in plain words: never the IdP's codes or descriptions. */
export function startOverRefusalLine(error: unknown, action: "ask" | "cancel" | "withdraw"): string {
    if (isUnreachable(error) || !(error instanceof IdpError)) return "Couldn't reach your instance. Try again."
    switch (error.code) {
        case APPROVAL_REQUIRED:
            return action === "cancel"
                ? "Only an approved device can cancel it, and your instance doesn't count this one as approved."
                : "Your instance doesn't let this device do that."
        case "access_denied":
            return "This device has been signed out of your account."
        case "device_required":
        case DEVICE_MISMATCH:
        case "no_root_key":
            return "This device isn't set up on your instance. Restart Pīna'i, then try again."
        case "start_over_ended":
            return "That request has ended already."
        default:
            return action === "ask" ? "Your instance didn't take the request. Try again later." : "Your instance didn't take that. Try again later."
    }
}
