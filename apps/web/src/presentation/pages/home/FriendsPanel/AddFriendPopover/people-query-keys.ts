/** "Add a friend"'s answers: every search by name and every lookup by address. */
export const peopleQueryKey = (idpUrl: string) => ["people", idpUrl] as const

export const peopleNamesQueryKey = (idpUrl: string) => [...peopleQueryKey(idpUrl), "names"] as const

export const peopleLookupQueryKey = (idpUrl: string) => [...peopleQueryKey(idpUrl), "address"] as const
