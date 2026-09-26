import type { MotifKey, ThemeId } from "@pinai/domain/models/user-settings"
import { Motif } from "@/presentation/atoms/motif/motif"
import { cn } from "@/presentation/_libs/utils"

interface ThemePreviewProps {
    theme: ThemeId
    motif: MotifKey
}

const CHANNELS = ["general", "protocol", "design", "releases"] as const

/**
 * A miniature of the app in `theme`. The palette's tokens are keyed on
 * `data-theme`, so setting it here re-scopes every token inside the preview
 * without touching the page. The motif is shown stronger than the app does
 * (2% dark / 10% light) so it still reads at this size.
 */
export function ThemePreview({ theme, motif }: ThemePreviewProps) {
    const isLight = theme.endsWith("-light")

    return (
        <div
            data-theme={theme}
            aria-hidden
            className="relative flex h-[188px] overflow-hidden rounded-[14px] border border-line bg-background bg-[image:var(--amb)] text-left font-sans text-foreground"
        >
            <Motif
                variant="field"
                motif={motif}
                size={26}
                className="absolute inset-0"
                style={{ opacity: isLight ? 0.11 : 0.07 }}
            />

            <span className="relative flex w-[34px] flex-col items-center gap-1.5 py-[9px]">
                {[0, 1, 2, 3].map((i) => (
                    <i
                        key={i}
                        className={cn(
                            "h-5 w-5 rounded-[8px] border",
                            i === 0 ? "border-acc bg-acc-soft" : "border-line bg-surf2",
                        )}
                    />
                ))}
            </span>

            <span className="relative flex w-[32%] max-w-[108px] flex-col gap-[3px] border-r border-line bg-surf px-1.5 py-[9px]">
                <span className="title truncate px-1 pb-1.5 text-[11px] leading-none">Aotearoa Collective</span>
                {CHANNELS.map((channel) => (
                    <span
                        key={channel}
                        className={cn(
                            "flex h-[15px] items-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-[5px] text-[8.5px]",
                            channel === "protocol"
                                ? "bg-acc-soft text-foreground shadow-[inset_0_0_0_1px_var(--accline)]"
                                : "text-muted-foreground",
                        )}
                    >
                        <b className="font-normal opacity-70">#</b>
                        {channel}
                    </span>
                ))}
            </span>

            <span className="relative flex min-w-0 flex-1 flex-col gap-2 px-[9px] pb-2 pt-[9px]">
                <span className="title flex items-center gap-1 border-b border-line pb-1.5 text-[11px]">
                    <span className="text-muted-foreground">#</span>protocol
                </span>
                <span className="grid grid-cols-[16px_1fr] gap-1.5">
                    <span className="title flex h-4 w-4 items-center justify-center rounded-full bg-acc text-[6.5px] font-semibold text-accink">
                        MK
                    </span>
                    <span>
                        <span className="title block text-[9.5px] font-semibold leading-none">Mika</span>
                        <span className="mt-1 block h-1 w-[92%] rounded-[2px] bg-surf3" />
                        <span className="mt-1 block h-1 w-[60%] rounded-[2px] bg-surf3" />
                        <span className="mt-[5px] inline-block h-2 w-[18px] rounded-full bg-acc-soft shadow-[inset_0_0_0_1px_var(--accline)]" />
                    </span>
                </span>
                <span className="grid grid-cols-[16px_1fr] gap-1.5">
                    <span className="title flex h-4 w-4 items-center justify-center rounded-full bg-surf3 text-[6.5px] font-semibold">
                        HŌ
                    </span>
                    <span>
                        <span className="title block text-[9.5px] font-semibold leading-none text-acc">Hōkū</span>
                        <span className="mt-1 block h-1 w-[74%] rounded-[2px] bg-surf3" />
                    </span>
                </span>
                <span className="mt-auto flex h-5 items-center justify-between rounded-full border border-line bg-surf pl-2 pr-[3px] text-[8px] text-muted-foreground">
                    Message
                    <em className="h-3.5 w-5 rounded-full bg-action" />
                </span>
            </span>
        </div>
    )
}
