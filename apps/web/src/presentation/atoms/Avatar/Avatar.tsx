import { tv } from "tailwind-variants"
import { avatarToneFor, type AvatarTone } from "@/presentation/_libs/avatar-tone"
import type { UserStatus } from "@pinai/domain/models/presence"

const avatar = tv({
    slots: {
        root: "relative shrink-0",
        face: "title flex items-center justify-center rounded-full font-semibold",
        dot: "absolute -bottom-px -right-px rounded-full border-2",
    },
    variants: {
        size: {
            xs: { face: "h-6 w-6 text-[10px]", dot: "h-2 w-2" },
            sm: { face: "h-[30px] w-[30px] text-[12px]", dot: "h-[11px] w-[11px]" },
            md: { face: "h-[38px] w-[38px] text-[14px]", dot: "h-[11px] w-[11px]" },
            lg: { face: "h-[60px] w-[60px] text-[22px]", dot: "h-[11px] w-[11px]" },
            xl: { face: "h-14 w-14 text-[22px]", dot: "h-[11px] w-[11px]" },
        },
        tone: {
            acc: { face: "bg-acc text-acc-ink" },
            sec: { face: "bg-sec text-sec-ink" },
            violet: { face: "bg-[oklch(0.70_0.085_300)] text-[oklch(0.18_0.02_300)]" },
            olive: { face: "bg-[oklch(0.80_0.095_110)] text-[oklch(0.18_0.02_110)]" },
            neutral: { face: "bg-surf3 text-foreground" },
            blue: { face: "bg-[oklch(0.75_0.080_245)] text-[oklch(0.18_0.02_245)]" },
        },
        status: {
            online: { dot: "bg-online" },
            idle: { dot: "bg-idle" },
            dnd: { dot: "bg-dnd" },
            invisible: { dot: "bg-muted-foreground" },
            offline: { dot: "bg-muted-foreground" },
        },
    },
    defaultVariants: { size: "sm", tone: "neutral" },
})

interface AvatarProps {
    initials: string
    /** When set, displays the image instead of initials. */
    imageUrl?: string | null
    /** Explicit tone. Wins over `seed`. */
    tone?: AvatarTone
    /** Hashed to a tone when `tone` is absent — pass the address so a person
     *  wears the same colour in every list. */
    seed?: string
    size?: "xs" | "sm" | "md" | "lg" | "xl"
    status?: UserStatus
    /** Border-color class matching the surface behind the dot. */
    statusBorderClass?: string
    className?: string
}

export function Avatar({
    initials,
    imageUrl,
    tone,
    seed,
    size = "sm",
    status,
    statusBorderClass = "border-background",
    className,
}: AvatarProps) {
    const styles = avatar({ size, status, tone: tone ?? (seed ? avatarToneFor(seed) : "neutral") })

    return (
        <div className={styles.root({ className })}>
            {imageUrl ? (
                <img src={imageUrl} alt={initials} className={styles.face({ className: "object-cover" })} />
            ) : (
                <div className={styles.face()}>{initials}</div>
            )}
            {status && <span className={styles.dot({ className: statusBorderClass })} />}
        </div>
    )
}
