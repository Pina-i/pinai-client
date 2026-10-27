import { Check, Copy, LinkIcon } from "lucide-react"

import { IconButton } from "@/presentation/atoms/IconButton/IconButton"

import { pill } from "../../editor-styles"

interface OneTimeLinkProps {
    link: string
    copied: boolean
    onCopy: () => void
}

/** `.ro-lnk` — a link just made, shown this once: its token in the accent, Copy beside it. */
export function OneTimeLink({ link, copied, onCopy }: OneTimeLinkProps) {
    const cut = link.lastIndexOf("/") + 1
    return (
        <div className="flex h-10 items-center gap-2 rounded-[12px] border border-acc-line bg-acc-soft pl-3 pr-1.5">
            <LinkIcon className="h-[13px] w-[13px] shrink-0 text-acc" aria-hidden />
            <code className="flex min-w-0 flex-[1_1_0] select-all items-baseline whitespace-nowrap font-mono text-[11.5px] text-foreground [font-variant-ligatures:none]">
                <span className="min-w-0 shrink-[4] truncate">{link.slice(0, cut)}</span>
                <b className="min-w-[6ch] shrink truncate font-medium text-acc">{link.slice(cut)}</b>
            </code>
            {/* Focus lands here as the link appears: the button that made it is gone. */}
            <IconButton
                autoFocus
                onPress={onCopy}
                className={pill({ variant: copied ? "outline" : "save", className: "h-7 gap-1.5 px-2.5 py-0 text-[11.5px]" })}
            >
                {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
                {copied ? "Copied" : "Copy"}
            </IconButton>
        </div>
    )
}
