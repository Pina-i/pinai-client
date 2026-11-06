import type { PasswordChange } from "@pinai/domain/models/instance-admin"

/** How to change the password on `host`, by its mode; `also` names who the reset signs out besides the user's other devices. */
export function passwordAdvice(how: PasswordChange, host: string, also: "theirs too" | "this one included"): string {
    switch (how) {
        case "forgot-password":
            return `Sign out, then choose "Forgot password?" on ${host}'s sign-in page: the reset link signs every device out, ${also}.`
        case "ask-an-admin":
            return `Ask an admin of ${host} for a password reset link: it signs every device out, ${also}.`
        case "where-it-runs":
            return `As an admin of ${host}, you get no reset link: change your password where the instance is run.`
        case "unknown":
            return `Change it with a reset link — "Forgot password?" on ${host}'s sign-in page, or ask its admin for one: it signs every device out, ${also}.`
    }
}
