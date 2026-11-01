import { ArrowRight, KeyRound } from "lucide-react"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { cn } from "@/presentation/_libs/utils"

interface InstanceBandProps {
    /** The instance's host, e.g. `idp.aotearoa.nz`. */
    host: string
    /** Private instances manage a roster: invitations and password resets. */
    isPrivate: boolean
    /** "N people", private instances only, when the instance says. */
    people?: string
    /** Instance management is the section shown on the right. */
    isActive: boolean
    onPress: () => void
}

/**
 * The admin's way into instance management: a band in the inverted colours,
 * above the setting tiles, rather than one tile among them.
 */
export function InstanceBand({ host, isPrivate, people, isActive, onPress }: InstanceBandProps) {
    const state = isPrivate ? `private${people ? ` · ${people}` : ""}` : "public · open registration"

    return (
        <IconButton
            onPress={onPress}
            className={cn(
                "group relative mb-3.5 flex w-full flex-wrap items-center justify-start gap-x-4 gap-y-3 overflow-hidden rounded-[18px] border px-[18px] py-4",
                "bg-foreground text-left text-background outline-none transition-[box-shadow] duration-150",
                "focus-visible:shadow-[0_0_0_2px_var(--acc)]",
                isActive
                    ? "border-acc shadow-[0_0_0_1px_var(--acc),0_0_26px_-8px_var(--acc)]"
                    : "border-[color-mix(in_oklab,var(--foreground)_22%,var(--line2))] hover:shadow-[0_10px_30px_-14px_color-mix(in_oklab,var(--foreground)_60%,transparent)]",
            )}
        >
            <span
                className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px]",
                    isActive ? "bg-acc text-acc-ink" : "bg-[color-mix(in_oklab,var(--background)_14%,transparent)] text-background",
                )}
            >
                <KeyRound className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>

            <span className="min-w-[140px] flex-[1_1_180px]">
                <span className="mb-[3px] block font-mono text-[10px] uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--background)_60%,transparent)]">
                    — You administer {host}
                </span>
                <span className="title block text-[17px] font-semibold leading-[1.2]">Instance management</span>
                <span className="mt-1 block text-[11.5px] leading-[1.45] text-[color-mix(in_oklab,var(--background)_70%,transparent)]">
                    {isPrivate
                        ? "Description, invitations and password resets."
                        : "How this instance describes itself on the sign-in door."}
                </span>
            </span>

            <span className="ml-auto flex shrink-0 items-center gap-3">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[color-mix(in_oklab,var(--background)_22%,transparent)] px-2.5 py-1 font-mono text-[10.5px]">
                    <i className={cn("h-[7px] w-[7px] rounded-full", isPrivate ? "bg-idle" : "bg-online")} />
                    {state}
                </span>
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-background text-foreground transition-transform duration-150 group-hover:translate-x-0.5">
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
            </span>
        </IconButton>
    )
}
