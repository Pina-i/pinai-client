import { Skeleton } from "@/presentation/atoms/Skeleton/Skeleton"

// Runs of messages as a conversation lays them out, the newest at the bottom.
const RUNS: { name: string; lines: string[]; image?: boolean }[] = [
    { name: "w-24", lines: ["w-[62%]", "w-[38%]"] },
    { name: "w-16", lines: ["w-[46%]"], image: true },
    { name: "w-28", lines: ["w-[70%]", "w-[54%]", "w-[30%]"] },
    { name: "w-20", lines: ["w-[42%]"] },
    { name: "w-24", lines: ["w-[58%]", "w-[24%]"] },
]

/** Stands in for a message list whose rows aren't laid out yet. */
export function MessageListSkeleton() {
    return (
        <div role="status" className="flex h-full flex-col justify-end gap-4 overflow-hidden px-3 pb-3">
            <span className="sr-only">Loading messages…</span>
            {RUNS.map((run, i) => (
                <div key={i} className="grid grid-cols-[38px_1fr] items-start gap-x-3.5 px-1.5">
                    <Skeleton shape="circle" className="h-[38px] w-[38px]" />
                    <div className="flex min-w-0 flex-col gap-2 pt-1">
                        <Skeleton className={`h-3 ${run.name}`} />
                        {run.lines.map((width, j) => (
                            <Skeleton key={j} className={width} />
                        ))}
                        {run.image && <Skeleton shape="block" className="mt-1 h-[140px] w-[220px] max-w-full" />}
                    </div>
                </div>
            ))}
        </div>
    )
}
