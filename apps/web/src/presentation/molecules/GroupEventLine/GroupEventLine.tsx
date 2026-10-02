interface GroupEventLineProps {
    text: string
    /** Pre-formatted "HH:MM". */
    timestamp: string
}

/** A change to the group, centred between its messages. */
export function GroupEventLine({ text, timestamp }: GroupEventLineProps) {
    return (
        <div className="my-1.5 flex items-baseline justify-center gap-2 px-4 text-center">
            <span className="text-[12.5px] text-muted-foreground">{text}</span>
            <span className="font-mono text-[9.5px] tracking-[0.03em] text-muted-foreground/70">{timestamp}</span>
        </div>
    )
}
