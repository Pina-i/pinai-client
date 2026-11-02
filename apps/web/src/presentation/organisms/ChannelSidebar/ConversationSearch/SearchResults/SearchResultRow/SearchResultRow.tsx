import { Hash, Volume2 } from "lucide-react"
import { ListBoxItem, Text } from "react-aria-components"
import { Avatar } from "@/presentation/atoms/Avatar/Avatar"
import { Highlight } from "@/presentation/atoms/Highlight/Highlight"
import { Kbd } from "@/presentation/atoms/Kbd/Kbd"
import { cn } from "@/presentation/_libs/utils"
import type { MarkedText, ResultRow, ResultVisual } from "../../ConversationSearch.viewmodel"
import { sidebarRowClass, sidebarRowOnClass } from "../../../sidebar-row.styles"

const tileClass = "flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[10px] bg-surf2"

function Visual({ visual }: { visual: ResultVisual }) {
    switch (visual.kind) {
        case "avatar":
            return (
                <Avatar
                    initials={visual.initials}
                    imageUrl={visual.imageUrl}
                    seed={visual.seed}
                    tone={visual.tone}
                    size="sm"
                    status={visual.status}
                />
            )
        case "server":
            return <span className={cn(tileClass, "title border border-line text-[11px] text-foreground")}>{visual.initials}</span>
        case "channel":
            return (
                <span className={tileClass}>
                    <Hash className="h-[15px] w-[15px]" />
                </span>
            )
        case "voice":
            return (
                <span className={cn(tileClass, "text-sec")}>
                    <Volume2 className="h-[15px] w-[15px]" />
                </span>
            )
    }
}

function Marked({ text }: { text: MarkedText }) {
    return (
        <>
            {text.prefix}
            <Highlight text={text.text} match={text.match} />
        </>
    )
}

export function SearchResultRow({ row }: { row: ResultRow }) {
    return (
        <ListBoxItem
            id={row.id}
            textValue={(row.title.prefix ?? "") + row.title.text}
            onAction={row.open}
            className={({ isFocused }) => cn(sidebarRowClass, isFocused && sidebarRowOnClass, row.isRemoved && "opacity-60")}
        >
            {({ isFocused }) => (
                <>
                    <Visual visual={row.visual} />
                    <span className="flex min-w-0 flex-1 flex-col">
                        <Text slot="label" className="title truncate text-[14px] font-semibold text-foreground">
                            <Marked text={row.title} />
                        </Text>
                        <Text slot="description" className="truncate text-[11px] text-muted-foreground">
                            <Marked text={row.subline} />
                        </Text>
                    </span>
                    {isFocused && <Kbd aria-hidden>↵</Kbd>}
                </>
            )}
        </ListBoxItem>
    )
}
