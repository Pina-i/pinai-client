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
    /** `underline` (default) rules the active tab in the accent; `pill` fills
     *  it inside a rounded track, as on the sign-in screen. */
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
            ? "flex gap-1 rounded-full bg-surf2 p-1"
            : "flex border-b border-line"

    const tabBase =
        variant === "pill"
            ? "flex flex-1 items-center justify-center rounded-full p-[9px] text-[12.5px] cursor-pointer outline-none transition-colors text-muted-foreground hovered:text-foreground selected:bg-acc selected:text-acc-ink selected:font-bold focus-visible:ring-2 focus-visible:ring-ring"
            : "flex-1 pb-3 text-sm cursor-pointer outline-none -mb-px border-b-2 border-transparent text-muted-foreground selected:border-acc selected:text-foreground hovered:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"

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
                    className={cn("pt-[18px] outline-none", tabPanelClassName)}
                >
                    {tab.content}
                </TabPanel>
            ))}
        </AriaTabs>
    )
}
