import { useState } from "react"
import { Check, Copy } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { cn } from "@/presentation/_libs/utils"

export interface RecoveryCodesGridProps {
    codes: string[]
    className?: string
}

/**
 * Renders the 10 one-time recovery codes in a 2-column grid with a copy-all
 * button. Plaintext is shown exactly once — this is the only place the
 * client surfaces them.
 */
export function RecoveryCodesGrid({ codes, className }: RecoveryCodesGridProps) {
    const [copied, setCopied] = useState(false)

    async function copyAll() {
        try {
            await navigator.clipboard.writeText(codes.join("\n"))
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            // Clipboard API can be blocked by perms — fall back silently; the
            // user can still copy via select-all on the grid.
        }
    }

    return (
        <div className={cn("space-y-3", className)}>
            <div className="grid grid-cols-2 gap-2 rounded-[var(--radius)] border border-border bg-input/40 p-4 font-mono text-[13px] text-foreground">
                {codes.map((c) => (
                    <code key={c} className="select-all tracking-[0.06em]">
                        {c}
                    </code>
                ))}
            </div>
            <Button variant="secondary" onPress={copyAll}>
                <span className="inline-flex items-center gap-2">
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copied" : "Copy all codes"}
                </span>
            </Button>
        </div>
    )
}
