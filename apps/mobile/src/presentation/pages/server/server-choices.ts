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
    meta: string
    info: InstanceInfo | null | undefined
}

/** The "Go to" row for what is typed, in the prototype's words; none for nothing, or a recent instance's host. */
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

/** "Recent", or once something is typed "Matches": the recent instances whose host or name holds it. */
export function instanceRows(input: string, recents: RecentInstance[]): { title: string; rows: InstanceRow[] } {
    const typed = input.trim().toLowerCase()
    const rows = recents
        .map(({ address, info }) => {
            const name = info?.name ?? address.host
            const meta = info === undefined ? "…" : info === null ? "not answering" : info.openRegistrations ? "open" : "invite only"
            return { address, name, initial: name.charAt(0).toUpperCase(), meta: `${address.host} · ${meta}`, info }
        })
        .filter((row) => !typed || row.address.host.includes(typed) || row.name.toLowerCase().includes(typed))
    return { title: typed ? "Matches" : "Recent", rows }
}
