export function UnreadPill({ count }: { count: number }) {
    return (
        <span className="shrink-0 rounded-full bg-acc px-2 py-0.5 font-mono text-[9.5px] font-bold text-acc-ink">
            {count}
        </span>
    )
}
