import type { Key, ReactNode } from "react"
import { Tab, TabList, TabPanel, Tabs } from "react-aria-components"
import { tv } from "tailwind-variants"
import { cn } from "@/presentation/_libs/utils"

export interface SegmentedTab<K extends string> {
    id: K
    label: string
}

const segmented = tv({
    slots: {
        list: "flex flex-wrap gap-1 rounded-[22px] p-1",
        tab: [
            "cursor-pointer rounded-full px-4 text-[12.5px] text-muted-foreground outline-none",
            "transition-colors duration-150 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            "selected:bg-acc selected:text-acc-ink selected:hover:text-acc-ink",
            "disabled:cursor-not-allowed disabled:opacity-60",
        ],
    },
    variants: {
        variant: {
            /** Outlined and centred, the hovered option filled: the Pass pages' and dialogs'. */
            pill: {
                list: "max-w-full justify-center border border-line bg-surf",
                tab: "py-[9px] hover:bg-surf2 selected:hover:bg-acc",
            },
            /** On a filled ground, the open one bold: a list's filters. */
            subtle: {
                list: "min-w-0 self-start bg-surf2",
                tab: "flex-none py-[7px] selected:font-bold max-[1180px]:px-[11px]",
            },
        },
    },
    defaultVariants: { variant: "pill" },
})

export type SegmentedTabsVariant = "pill" | "subtle"

interface SegmentedTabsRootProps<K extends string> {
    selected: K
    onChange: (id: K) => void
    /** No tab can be switched to, as while an action runs. */
    isDisabled?: boolean
    /** Arrows only move the focus; Enter or a press opens the tab. */
    manualActivation?: boolean
    /** The `SegmentedTabList`, the `SegmentedTabPanel`s, laid out as the caller needs. */
    children: ReactNode
    className?: string
}

/** The tabs' state, for a layout `SegmentedTabs` doesn't draw: the list beside other controls, say. */
export function SegmentedTabsRoot<K extends string>({
    selected,
    onChange,
    isDisabled,
    manualActivation,
    children,
    className,
}: SegmentedTabsRootProps<K>) {
    return (
        <Tabs
            selectedKey={selected}
            onSelectionChange={(key: Key) => onChange(String(key) as K)}
            isDisabled={isDisabled}
            keyboardActivation={manualActivation ? "manual" : "automatic"}
            className={className}
        >
            {children}
        </Tabs>
    )
}

interface SegmentedTabListProps<K extends string> {
    tabs: readonly SegmentedTab<K>[]
    /** Accessible name for the tab list. */
    label: string
    variant?: SegmentedTabsVariant
    className?: string
}

/** The tabs as a pill of options. Wraps on a narrow screen. */
export function SegmentedTabList<K extends string>({ tabs, label, variant, className }: SegmentedTabListProps<K>) {
    const styles = segmented({ variant })
    return (
        <TabList aria-label={label} className={styles.list({ className })}>
            {tabs.map((tab) => (
                <Tab key={tab.id} id={tab.id} className={styles.tab()}>
                    {tab.label}
                </Tab>
            ))}
        </TabList>
    )
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
        <SegmentedTabsRoot
            selected={selected}
            onChange={onChange}
            isDisabled={isDisabled}
            // A tab may start work as it opens (a code asked for): arrows only move focus, Enter opens.
            manualActivation
            className={cn("flex w-full flex-col items-center gap-[26px]", className)}
        >
            <SegmentedTabList tabs={tabs} label={label} />
            {children}
        </SegmentedTabsRoot>
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
