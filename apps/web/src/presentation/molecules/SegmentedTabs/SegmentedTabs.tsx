import type { Key, ReactNode } from "react"
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components"
import { cn } from "@/presentation/_libs/utils"

export interface SegmentedTab<K extends string> {
    id: K
    label: string
}

interface SegmentedTabsProps<K extends string> {
    tabs: readonly SegmentedTab<K>[]
    selected: K
    onChange: (id: K) => void
    /** Accessible name for the tab list. */
    label: string
    /** No tab can be switched to, as while an action runs. */
    isDisabled?: boolean
    /** The `SegmentedTabPanel`s, one per tab. */
    children: ReactNode
    className?: string
}

/** Tabs drawn as a pill of options, their panels below; one always open. Wraps on a narrow screen. */
export function SegmentedTabs<K extends string>({ tabs, selected, onChange, label, isDisabled, children, className }: SegmentedTabsProps<K>) {
    return (
        <Tabs
            selectedKey={selected}
            onSelectionChange={(key: Key) => onChange(String(key) as K)}
            isDisabled={isDisabled}
            // A tab may start work as it opens (a code asked for): arrows only move focus, Enter opens.
            keyboardActivation="manual"
            className={cn("flex w-full flex-col items-center gap-[26px]", className)}
        >
            <TabList
                aria-label={label}
                className="flex max-w-full flex-wrap justify-center gap-1 rounded-[22px] border border-line bg-surf p-1"
            >
                {tabs.map((tab) => (
                    <Tab
                        key={tab.id}
                        id={tab.id}
                        className={cn(
                            "cursor-pointer rounded-full px-4 py-[9px] text-[12.5px] text-muted-foreground outline-none",
                            "transition-colors duration-150 hover:bg-surf2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                            "selected:bg-acc selected:text-acc-ink selected:hover:bg-acc selected:hover:text-acc-ink",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                        )}
                    >
                        {tab.label}
                    </Tab>
                ))}
            </TabList>
            {children}
        </Tabs>
    )
}

interface SegmentedTabPanelProps {
    id: string
    /** Mounted while another tab is open, hidden: what runs in it keeps running. */
    keepMounted?: boolean
    children: ReactNode
    className?: string
}

export function SegmentedTabPanel({ id, keepMounted, children, className }: SegmentedTabPanelProps) {
    return (
        <TabPanel
            id={id}
            shouldForceMount={keepMounted}
            className={cn(
                "w-full outline-none data-[inert=true]:hidden",
                // A panel with nothing to tab to takes the focus itself: it shows.
                "data-[focus-visible]:ring-2 data-[focus-visible]:ring-inset data-[focus-visible]:ring-ring",
                className,
            )}
        >
            {children}
        </TabPanel>
    )
}
