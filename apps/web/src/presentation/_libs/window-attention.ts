/** Visible and focused; the desktop app's window reports minimised as hidden. */
export function isWindowAttended(): boolean {
    return document.visibilityState === "visible" && document.hasFocus()
}

export function subscribeWindowAttention(onChange: () => void): () => void {
    let settled: ReturnType<typeof setTimeout> | undefined
    const onBlur = () => {
        onChange()
        // A browser may still report focus inside `blur`: look again once it has settled.
        clearTimeout(settled)
        settled = setTimeout(onChange, 0)
    }
    document.addEventListener("visibilitychange", onChange)
    window.addEventListener("focus", onChange)
    window.addEventListener("blur", onBlur)
    return () => {
        document.removeEventListener("visibilitychange", onChange)
        window.removeEventListener("focus", onChange)
        window.removeEventListener("blur", onBlur)
        clearTimeout(settled)
    }
}
