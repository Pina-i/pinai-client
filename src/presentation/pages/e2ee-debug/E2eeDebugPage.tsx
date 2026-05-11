import { useE2eeDebugViewModel } from "./E2eeDebugPage.viewmodel"

/**
 * Hidden DEV-only panel for verifying E2EE state. Rendered at
 * `/settings/e2ee-debug` and gated by `import.meta.env.DEV` in the
 * route file — production builds never reach this component.
 *
 * Plain Tailwind / no Atomic Design components — this is internal
 * tooling, not UX. Keep dense and copy-pastable.
 */
export function E2eeDebugPage() {
    const vm = useE2eeDebugViewModel()

    return (
        <div className="mx-auto max-w-3xl space-y-8 p-6 font-mono text-sm">
            <header className="space-y-1">
                <h1 className="text-xl font-semibold">E2EE debug</h1>
                <p className="text-muted-foreground">
                    DEV-only inspection of MLS identity, peer-fingerprint cache, and KeyPackage
                    stash counts. Hidden from production builds.
                </p>
                <button
                    type="button"
                    onClick={vm.refresh}
                    disabled={vm.refreshing}
                    className="cursor-pointer rounded border border-border bg-muted px-3 py-1 text-xs hover:bg-muted/70 disabled:opacity-50"
                >
                    {vm.refreshing ? "Refreshing…" : "Refresh"}
                </button>
            </header>

            <section className="space-y-2">
                <h2 className="text-base font-semibold">Own MSK fingerprint</h2>
                {vm.ownFingerprint ? (
                    <div className="rounded border border-border bg-muted/30 p-3">
                        <FingerprintGroups fingerprint={vm.ownFingerprint} />
                    </div>
                ) : (
                    <p className="text-muted-foreground">
                        No identity registered on this device. Call{" "}
                        <code>register-identity.usecase</code> to bootstrap.
                    </p>
                )}
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold">Cached peer fingerprints</h2>
                {Object.keys(vm.fingerprintsByActorUri).length === 0 ? (
                    <p className="text-muted-foreground">No peers fetched yet.</p>
                ) : (
                    <ul className="space-y-1">
                        {Object.entries(vm.fingerprintsByActorUri).map(([actorUri, fp]) => (
                            <li
                                key={actorUri}
                                className="rounded border border-border bg-muted/30 p-3"
                            >
                                <div className="text-xs text-muted-foreground">{actorUri}</div>
                                <FingerprintGroups fingerprint={fp} />
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="space-y-2">
                <h2 className="text-base font-semibold">KeyPackage stash</h2>
                {vm.statusError ? (
                    <p className="text-destructive">{vm.statusError}</p>
                ) : vm.keyPackageStatus ? (
                    <div className="space-y-2">
                        <div className="text-xs text-muted-foreground">
                            cap = {vm.keyPackageStatus.cap}, refill_threshold ={" "}
                            {vm.keyPackageStatus.refill_threshold}
                        </div>
                        {vm.keyPackageStatus.devices.length === 0 ? (
                            <p className="text-muted-foreground">No devices yet.</p>
                        ) : (
                            <table className="w-full border-collapse text-xs">
                                <thead>
                                    <tr className="border-b border-border text-left">
                                        <th className="py-1 pr-2">device_id</th>
                                        <th className="py-1 pr-2">available</th>
                                        <th className="py-1">needs_refill</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vm.keyPackageStatus.devices.map((d) => (
                                        <tr key={d.device_id} className="border-b border-border/40">
                                            <td className="py-1 pr-2">{d.device_id}</td>
                                            <td className="py-1 pr-2">{d.available}</td>
                                            <td className="py-1">{d.needs_refill ? "yes" : "no"}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ) : (
                    <p className="text-muted-foreground">No status yet.</p>
                )}
            </section>
        </div>
    )
}

/**
 * Renders a 60-char fingerprint as 12 groups of 5 — the same layout
 * Phase 6's verification UI will use, so this matches the eventual
 * end-user shape.
 */
function FingerprintGroups({ fingerprint }: { fingerprint: string }) {
    const groups: string[] = []
    for (let i = 0; i < fingerprint.length; i += 5) {
        groups.push(fingerprint.slice(i, i + 5))
    }
    return (
        <div className="break-all text-base tracking-widest">
            {groups.map((g, idx) => (
                <span key={idx} className="mr-2">
                    {g}
                </span>
            ))}
        </div>
    )
}
