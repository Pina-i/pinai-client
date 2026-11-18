import { AtSign, Search } from "lucide-react"

/** The two ways to find someone, before anything is typed. */
export function IntroCards({ domain }: { domain: string }) {
    return (
        <div className="grid grid-cols-1 gap-2.5 pb-1.5 pl-4 pt-3.5 min-[540px]:grid-cols-2">
            <div className="rounded-[16px] bg-surf2 p-3.5">
                <Search className="mb-2 h-4 w-4 text-acc" aria-hidden />
                <span className="block text-[13px] font-medium text-foreground">By name</span>
                <span className="mt-1 block text-[12px] leading-[1.45] text-muted-ink">
                    Anyone on {domain}, and people from your groups. Accents don't matter.
                </span>
            </div>
            <div className="rounded-[16px] bg-surf2 p-3.5">
                <AtSign className="mb-2 h-4 w-4 text-sec" aria-hidden />
                <span className="block text-[13px] font-medium text-foreground">By full address</span>
                <span className="mt-1 block text-[12px] leading-[1.45] text-muted-ink">
                    Everyone else. Ask them for it — it ends with their server, like{" "}
                    <span className="font-mono text-foreground">name_ab3xz@server</span>.
                </span>
            </div>
        </div>
    )
}
