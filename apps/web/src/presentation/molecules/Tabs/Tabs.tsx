import { Tabs as AriaTabs, TabList, Tab, TabPanel, type Key } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"

export interface TabItem {
    id: string
    label: string
    content: React.ReactNode
}

type TabsVariant = "underline" | "pill"

interface TabsProps {
    tabs: TabItem[]
    selectedKey?: string
    onSelectionChange?: (key: string) => void
    /** Visual style of the tab list. `underline` (default) draws a primary-colour
     *  underline beneath the active tab. `pill` renders pill segments inside a
     *  muted track, matching the design's editorial sign-in tabs. */
    variant?: TabsVariant
    className?: string
    tabListClassName?: string
    tabPanelClassName?: string
}

export function Tabs({
    tabs,
    selectedKey,
    onSelectionChange,
    variant = "underline",
    className,
    tabListClassName,
    tabPanelClassName,
}: TabsProps) {
    const tabListBase =
        variant === "pill"
            ? "flex gap-[2px] rounded-sm bg-muted p-[3px]"
            : "flex border-b border-border"

    const tabBase =
        variant === "pill"
            ? "flex flex-1 items-center justify-center py-[9px] px-[10px] text-[12.5px] leading-[1.2] tracking-[0.02em] cursor-pointer outline-none rounded-[5px] transition-colors text-muted-foreground hovered:text-foreground selected:bg-card selected:text-foreground selected:font-medium selected:shadow-[0_1px_2px_rgba(0,0,0,0.25)] focus-visible:ring-2 focus-visible:ring-ring"
            : "flex-1 pb-3 text-sm cursor-pointer outline-none -mb-px border-b-2 border-transparent text-muted-foreground selected:border-primary selected:text-foreground hovered:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"

    return (
        <AriaTabs
            selectedKey={selectedKey}
            onSelectionChange={(key: Key) => onSelectionChange?.(String(key))}
            className={className}
        >
            <TabList className={cn(tabListBase, tabListClassName)}>
                {tabs.map((tab) => (
                    <Tab key={tab.id} id={tab.id} className={tabBase}>
                        {tab.label}
                    </Tab>
                ))}
            </TabList>
            {tabs.map((tab) => (
                <TabPanel
                    key={tab.id}
                    id={tab.id}
                    className={cn("pt-5 space-y-4", tabPanelClassName)}
                >
                    {tab.content}
                </TabPanel>
            ))}
        </AriaTabs>
    )
}
