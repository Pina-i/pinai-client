import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { cn } from "@/presentation/_libs/utils"

export interface RecoveryCodesGridProps {
    codes: string[]
    className?: string
}

/** The one place the client ever shows the plaintext recovery codes. */
export function RecoveryCodesGrid({ codes, className }: RecoveryCodesGridProps) {
    const [copied, setCopied] = useState(false)

    async function copyAll() {
        try {
            await navigator.clipboard.writeText(codes.join("\n"))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard can be blocked by permissions; select-all on the grid still works.
        }
    }

    return (
        <div className={cn("flex flex-col gap-3", className)}>
            <div className="grid grid-cols-2 gap-1.5 rounded-[18px] border border-line bg-surf p-3.5 backdrop-blur-[14px]">
                {codes.map((c, i) => (
                    <div
                        key={c}
                        className="flex min-w-0 items-center gap-2 rounded-[7px] border border-line bg-background px-2.5 py-2"
                    >
                        <span className="shrink-0 font-mono text-[8.5px] tracking-[0.05em] text-muted-foreground">
                            {String(i + 1).padStart(2, "0")}
                        </span>
                        <code className="select-all truncate font-mono text-[12px] font-medium tracking-[0.06em] text-foreground">
                            {c}
                        </code>
                    </div>
                ))}
            </div>
            <Button variant="secondary" onPress={copyAll}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copied" : "Copy all codes"}
            </Button>
        </div>
    )
}
