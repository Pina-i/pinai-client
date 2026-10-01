import { ChoiceCard, ChoiceCardGroup } from "@/presentation/molecules/ChoiceCardGroup/ChoiceCardGroup"
import { BlockedPersonRow } from "@/presentation/molecules/BlockedPersonRow/BlockedPersonRow"
import { editorFrame, editorTitle, fieldLabel } from "../editor-styles"
import { CONTACT_POLICY_CHOICES, usePrivacyEditorViewModel } from "./PrivacyEditor.viewmodel"

export function PrivacyEditor() {
    const vm = usePrivacyEditorViewModel()

    return (
        <div className={editorFrame}>
            <p className="mono-eyebrow mb-[5px]">Editing · Privacy &amp; safety</p>
            <h2 className={editorTitle}>Who can reach you, and how.</h2>

            <section className="mt-7">
                <span className={fieldLabel}>Who can message you or add you to a group</span>
                <ChoiceCardGroup
                    label="Who can message you or add you to a group"
                    value={vm.contactPolicy}
                    onChange={(policy) => void vm.chooseContactPolicy(policy)}
                    className="mt-1 flex flex-col gap-2"
                >
                    {CONTACT_POLICY_CHOICES.map((choice) => (
                        <ChoiceCard
                            key={choice.value}
                            value={choice.value}
                            className="rounded-[16px] border border-line bg-surf px-4 py-3 hover:bg-surf2"
                            selectedClassName="border-acc shadow-[0_0_0_1px_var(--acc)]"
                        >
                            {() => (
                                <>
                                    <span className="block text-[13.5px] font-semibold">{choice.label}</span>
                                    <span className="mt-0.5 block text-[12px] text-muted-foreground">{choice.description}</span>
                                </>
                            )}
                        </ChoiceCard>
                    ))}
                </ChoiceCardGroup>
                <p className="mt-2 text-[11.5px] text-muted-foreground">
                    Anyone can still send you a friend request — except the people you blocked.
                </p>
            </section>

            <section className="mt-8">
                <span className={fieldLabel}>Blocked</span>
                {vm.isLoadingBlocks && <p className="title py-4 text-[12px] italic text-muted-foreground">Loading…</p>}
                {!vm.isLoadingBlocks && vm.blocked.length === 0 && (
                    <p className="title py-4 text-[12px] italic text-muted-foreground">You haven't blocked anyone.</p>
                )}
                {vm.blocked.map((person) => (
                    <BlockedPersonRow
                        key={person.actorUri}
                        person={person}
                        isPending={vm.isUnblocking}
                        onUnblock={(p) => void vm.unblock(p.actorUri, p.name)}
                    />
                ))}
            </section>
        </div>
    )
}
