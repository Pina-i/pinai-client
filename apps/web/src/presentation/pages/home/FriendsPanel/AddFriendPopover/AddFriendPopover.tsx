import { AtSign, Plus, X } from "lucide-react"
import { Button } from "@/presentation/atoms/Button/Button"
import { IconButton } from "@/presentation/atoms/IconButton/IconButton"
import { ScrollArea } from "@/presentation/atoms/ScrollArea/ScrollArea"
import { SearchField } from "@/presentation/atoms/SearchField/SearchField"
import { Spinner } from "@/presentation/atoms/Spinner/Spinner"
import { Popover } from "@/presentation/molecules/Popover/Popover"
import { popoverSurface } from "@/presentation/molecules/Popover/popover-surface"
import { cn } from "@/presentation/_libs/utils"
import { useAddFriendPopoverViewModel } from "./AddFriendPopover.viewmodel"
import { AddressResult } from "./AddressResult/AddressResult"
import { IntroCards } from "./IntroCards/IntroCards"
import { NamesResult } from "./NamesResult/NamesResult"
import { PeopleSection } from "./PeopleSection/PeopleSection"
import { actionButton } from "./PersonAction/action-button"
import { Tag } from "./Tag/Tag"

export function AddFriendPopover() {
    return (
        <Popover
            placement="bottom end"
            offset={12}
            label="Add a friend"
            trigger={
                <Button
                    variant="primary"
                    size="inline"
                    className="flex-none aria-expanded:shadow-[0_0_0_3px_color-mix(in_oklab,var(--action)_25%,transparent)]"
                >
                    <Plus className="h-[15px] w-[15px]" />
                    Add friend
                </Button>
            }
            className={cn(popoverSurface, "w-[560px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[22px]")}
        >
            <AddFriendPanel />
        </Popover>
    )
}

// Mounted with the popover, so each opening starts from an empty field.
function AddFriendPanel() {
    const vm = useAddFriendPopoverViewModel()

    return (
        <>
            <div className="border-b border-line pb-3 pl-11 pr-[22px] pt-[18px]">
                <div className="flex min-h-[18px] items-center justify-between gap-3">
                    <p className="fact text-muted-ink">Add a friend · searching outward from you</p>
                    {vm.isAddressMode && (
                        <Tag tone="acc" icon={<AtSign />}>
                            address
                        </Tag>
                    )}
                </div>
                <SearchField
                    aria-label="Name or full address"
                    placeholder="A name, or a full address"
                    value={vm.text}
                    onChange={vm.setText}
                    inputRef={vm.inputRef}
                    autoFocus
                    className={cn(
                        "mt-2.5 h-[42px] rounded-[12px] border-line2 text-[14px] transition-[border-color,box-shadow] duration-150",
                        "focus-within:border-acc focus-within:shadow-[0_0_0_3px_var(--accsoft)] [&_input]:placeholder:text-muted-ink",
                        vm.text.trim() && "border-acc shadow-[0_0_0_3px_var(--accsoft)]",
                    )}
                    trailing={
                        <>
                            {vm.isBusy && <Spinner />}
                            {vm.text && (
                                <IconButton
                                    aria-label="Clear"
                                    className="h-[22px] w-[22px] shrink-0 rounded-full bg-surf3 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-3 w-3" />
                                </IconButton>
                            )}
                        </>
                    }
                />
                <p role="status" className="mb-0 mt-2 font-mono text-[10.5px] tracking-[.03em] text-muted-ink">
                    {vm.status}
                </p>
            </div>

            <ScrollArea className="max-h-[470px] pb-4 pl-7 pr-[22px] pt-1">
                {vm.isIntro || !vm.names || !vm.address ? (
                    <IntroCards domain={vm.domain} />
                ) : (
                    <>
                        <PeopleSection step={1} tone="acc" title="Your server" subtitle={`${vm.domain} · accents ignored`}>
                            <NamesResult
                                view={vm.names}
                                section="server"
                                domain={vm.domain}
                                onAdd={vm.add}
                                onAccept={vm.accept}
                            />
                        </PeopleSection>
                        <PeopleSection step={2} tone="sec" title="Your groups" subtitle="people you already share a group with">
                            <NamesResult
                                view={vm.names}
                                section="groups"
                                domain={vm.domain}
                                onAdd={vm.add}
                                onAccept={vm.accept}
                            />
                        </PeopleSection>
                        <PeopleSection step={3} tone="muted" title="Everywhere else" subtitle="only with their exact address">
                            {/* Read out: the status line only says "Address lookup finished". */}
                            <div aria-live="polite">
                                <AddressResult view={vm.address} onAdd={vm.add} onAccept={vm.accept} />
                            </div>
                        </PeopleSection>
                    </>
                )}
            </ScrollArea>

            <div className="flex items-center gap-3 border-t border-line bg-popover pb-3.5 pl-11 pr-[18px] pt-3">
                <span className="min-w-0 flex-1">
                    <span className="eye block text-muted-ink">Your full address — friends on other servers need it</span>
                    <span className="mt-[3px] block truncate font-mono text-[13px] text-foreground">{vm.userAddress}</span>
                </span>
                <Button
                    variant="secondary"
                    size="none"
                    aria-label="Copy your full address"
                    onPress={vm.copyAddress}
                    className={actionButton({
                        className: vm.copied
                            ? "border-[color:color-mix(in_oklab,var(--online)_45%,transparent)] text-online-ink"
                            : undefined,
                    })}
                >
                    {vm.copied ? "✓ Copied" : "Copy address"}
                </Button>
                <span className="sr-only" aria-live="polite">
                    {vm.copied ? "Copied" : ""}
                </span>
            </div>
        </>
    )
}
