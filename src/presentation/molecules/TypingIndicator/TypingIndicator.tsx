interface TypingIndicatorProps {
    name: string
    color?: string
}

/**
 * Mirrors `TypingRow` in `design/screens/chat.jsx`: three bouncing dots in
 * the peer's accent colour followed by the italic-serif "{name} is writing…"
 * label. The 54px left-padding lines the row up with the message-text
 * column (40px avatar + 14px gap).
 */
export function TypingIndicator({ name, color }: TypingIndicatorProps) {
    const dotColor = color ?? "var(--chat)"
    return (
        <div
            className="flex items-center gap-2.5 pl-[54px] pr-0 py-2.5 italic"
            style={{ fontFamily: "var(--font-serif)", fontSize: 12, color: "var(--muted-foreground)" }}
            aria-live="polite"
        >
            <div className="flex gap-[3px]">
                {[0, 1, 2].map((i) => (
                    <span
                        key={i}
                        style={{
                            width: 5,
                            height: 5,
                            borderRadius: "50%",
                            background: dotColor,
                            animation: `pn-bounce 1.1s ${i * 0.15}s ease-in-out infinite`,
                        }}
                    />
                ))}
            </div>
            <span>{name} is writing…</span>
        </div>
    )
}
