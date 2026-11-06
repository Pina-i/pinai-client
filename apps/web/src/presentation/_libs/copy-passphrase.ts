import { toast } from "sonner"

/** The 24 words to the clipboard, single-spaced, saying whether it took them. */
export function copyPassphrase(words: readonly string[]): void {
    if (words.length === 0) return
    navigator.clipboard.writeText(words.join(" ")).then(
        () => toast.success("Passphrase copied"),
        () => toast.error("Could not copy — write the words down manually"),
    )
}
