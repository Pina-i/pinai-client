// Apple keyboards put an app's shortcuts on ⌘, the others on Ctrl.
const ON_APPLE = /mac|iphone|ipad|ipod/i.test(navigator.userAgent)

/** Whether a keydown is the shortcut Mod+`key`, Mod being ⌘ on Apple devices and Ctrl elsewhere. */
export function isModShortcut(e: KeyboardEvent, key: string, onApple = ON_APPLE): boolean {
    const mod = onApple ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
    return mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === key
}

/** Mod+`key` as the keyboard shows it: "⌘K", "Ctrl K". */
export function modShortcutLabel(key: string, onApple = ON_APPLE): string {
    return onApple ? `⌘${key.toUpperCase()}` : `Ctrl ${key.toUpperCase()}`
}
