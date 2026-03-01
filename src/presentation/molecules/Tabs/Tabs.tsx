import { Tabs as AriaTabs, TabList, Tab, TabPanel, type Key } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"

export interface TabItem {
    id: string
    label: string
    content: React.ReactNode
}

interface TabsProps {
    tabs: TabItem[]
    selectedKey?: string
    onSelectionChange?: (key: string) => void
    className?: string
    tabListClassName?: string
    tabPanelClassName?: string
}

export function Tabs({
    tabs,
    selectedKey,
    onSelectionChange,
    className,
    tabListClassName,
    tabPanelClassName,
}: TabsProps) {
    return (
        <AriaTabs
            selectedKey={selectedKey}
            onSelectionChange={(key: Key) => onSelectionChange?.(String(key))}
            className={className}
        >
            <TabList className={cn("flex border-b border-border", tabListClassName)}>
                {tabs.map((tab) => (
                    <Tab
                        key={tab.id}
                        id={tab.id}
                        className="flex-1 pb-3 text-sm cursor-pointer outline-none -mb-px border-b-2 border-transparent text-muted-foreground selected:border-primary selected:text-foreground hovered:text-foreground transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                    >
                        {tab.label}
                    </Tab>
                ))}
            </TabList>
            {tabs.map((tab) => (
                <TabPanel
                    key={tab.id}
                    id={tab.id}
                    className={cn("pt-4 space-y-4", tabPanelClassName)}
                >
                    {tab.content}
                </TabPanel>
            ))}
        </AriaTabs>
    )
}
