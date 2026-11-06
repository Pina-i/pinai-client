import { APPROVAL_REQUIRED, DEVICE_MISMATCH, IdpError, isUnreachable } from "@pinai/domain/models/idp-error"

/** What a start over request's refusal means, in plain words: never the IdP's codes or descriptions. */
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
            return "This device isn't set up on your instance. Reload Pīna'i, then try again."
        case "start_over_ended":
            return "That request has ended already."
        default:
            return action === "ask" ? "Your instance didn't take the request. Try again later." : "Your instance didn't take that. Try again later."
    }
}
