import { instanceAddress, type InstanceAddress, type InstanceInfo, type InstanceResolution } from "@pinai/domain/models/instance"

/** One of this phone's recent instances; `info` `undefined` while its NodeInfo is read, `null` when it gave none. */
export interface RecentInstance {
    address: InstanceAddress
    info: InstanceInfo | null | undefined
}

export interface GoTo {
    host: string
    meta: string
    /** Set once the address typed is a Pīna'i instance: what Continue opens. */
    ready: { address: InstanceAddress; info: InstanceInfo } | null
}

export interface InstanceRow {
    address: InstanceAddress
    name: string
    initial: string
    description: string | null
    /** Who may sign up: `open`, `invite only`; `…` while it is read, `not answering`. */
    registration: string
    /** The instance whose host is the one typed. */
    found: boolean
    label: string
    info: InstanceInfo | null | undefined
}

export function goToRow(input: string, resolution: InstanceResolution, recents: RecentInstance[]): GoTo | null {
    const typed = input.trim()
    if (!typed) return null
    const host = instanceAddress(typed)?.host ?? typed
    if (recents.some((recent) => recent.address.host === host)) return null
    switch (resolution.kind) {
        case "not-an-address":
            return { host, meta: "keep typing — a server looks like name.tld", ready: null }
        case "pending":
            return { host, meta: "checking…", ready: null }
        case "not-pinai":
            return { host, meta: "no Pīna'i server here", ready: null }
        case "resolved":
            return { host, meta: "open this server", ready: { address: resolution.address, info: resolution.info } }
    }
}

/** "Recent"; once something is typed, "Found" when an instance's host is what is typed, else "Matches": those whose host or name holds it. */
export function instanceRows(input: string, recents: RecentInstance[]): { title: string; rows: InstanceRow[] } {
    const typed = input.trim().toLowerCase()
    const typedHost = typed && (instanceAddress(typed)?.host ?? typed)
    const rows = recents
        .map(({ address, info }): InstanceRow => {
            const name = info?.name ?? address.host
            const registration = info === undefined ? "…" : info === null ? "not answering" : info.openRegistrations ? "open" : "invite only"
            const found = address.host === typedHost
            const said = info ? (info.openRegistrations ? "open registration" : "invite only") : registration
            const label = [name, address.host, said, ...(found ? ["matches what you typed"] : [])].join(", ")
            return { address, name, initial: name.charAt(0).toUpperCase(), description: info?.description ?? null, registration, found, label, info }
        })
        .filter((row) => !typed || row.address.host.includes(typedHost) || row.name.toLowerCase().includes(typed))
    return { title: !typed ? "Recent" : rows.some((row) => row.found) ? "Found" : "Matches", rows }
}
