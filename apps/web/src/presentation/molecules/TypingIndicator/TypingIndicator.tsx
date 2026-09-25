interface TypingIndicatorProps {
    name: string
    color?: string
}

// The 52px indent lines the row up with the message text column.
export function TypingIndicator({ name, color = "var(--acc)" }: TypingIndicatorProps) {
    return (
        <div
            className="title flex items-center gap-2.5 pl-[52px] pt-2 text-[13px] italic text-muted-foreground"
            aria-live="polite"
        >
            {[0, 1, 2].map((i) => (
                <span
                    key={i}
                    className="h-[5px] w-[5px] rounded-full"
                    style={{ background: color, animation: `pn-bounce 1.1s ${i * 0.15}s ease-in-out infinite` }}
                />
            ))}
            <span>{name} is writing…</span>
        </div>
    )
}
