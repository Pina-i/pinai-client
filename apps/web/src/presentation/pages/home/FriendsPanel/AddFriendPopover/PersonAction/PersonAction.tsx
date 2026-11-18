import { Ban, Check, Clock, Send, UserCheck, UserPlus } from "lucide-react"
import type { ReactNode } from "react"
import { tv } from "tailwind-variants"
import type { ShownRelation } from "@pinai/domain/models/people-search"
import { Button } from "@/presentation/atoms/Button/Button"
import { Spinner } from "@/presentation/atoms/Spinner/Spinner"
import { actionButton } from "./action-button"

const chip = tv({
    base: "inline-flex h-[26px] shrink-0 items-center gap-[5px] whitespace-nowrap rounded-full border-0 px-2.5 font-mono text-[10px] font-normal uppercase tracking-[.06em] shadow-none [&_svg]:h-[11px] [&_svg]:w-[11px]",
    variants: {
        tone: {
            muted: "bg-surf2 text-muted-ink",
            friend: "bg-[color-mix(in_oklab,var(--online)_14%,transparent)] text-online-ink",
        },
    },
    defaultVariants: { tone: "muted" },
})

export function StatusChip({ tone, icon, children }: { tone?: "muted" | "friend"; icon?: ReactNode; children: ReactNode }) {
    return (
        <span className={chip({ tone })}>
            {icon}
            {children}
        </span>
    )
}

interface PersonActionProps {
    shown: ShownRelation
    name: string
    /** The found card's: "Send request" and Accept stand out there. */
    prominent?: boolean
    onAdd: () => void
    onAccept: () => void
}

/** What the user can do about someone found, or where things stand with them. */
export function PersonAction({ shown, name, prominent = false, onAdd, onAccept }: PersonActionProps) {
    switch (shown) {
        case "none":
        case "sending":
        case "request_received":
        case "accepting": {
            const adding = shown === "none" || shown === "sending"
            const pending = shown === "sending" || shown === "accepting"
            const label = adding ? (prominent ? "Send request" : "Add") : "Accept"
            // One button through its request, so the focus stays on it while it is pending.
            return (
                <Button
                    variant={prominent ? "primary" : "secondary"}
                    size="none"
                    isPending={pending}
                    onPress={adding ? onAdd : onAccept}
                    aria-label={adding && prominent ? `Send request to ${name}` : `${label} ${name}`}
                    className={pending ? chip() : actionButton({ prominent })}
                >
                    {pending ? (
                        <>
                            <Spinner size="sm" label={adding ? "Sending" : "Accepting"} />
                            {adding ? "Sending" : "Accepting"}
                        </>
                    ) : (
                        <>
                            {adding ? prominent ? <Send /> : <UserPlus /> : <UserCheck />}
                            {label}
                        </>
                    )}
                </Button>
            )
        }
        case "request_sent":
            return <StatusChip icon={<Clock />}>Pending</StatusChip>
        case "friend":
            return (
                <StatusChip tone="friend" icon={<Check />}>
                    Friends
                </StatusChip>
            )
        case "blocked":
            return <StatusChip icon={<Ban />}>Blocked</StatusChip>
    }
}
