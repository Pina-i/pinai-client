import { refusedAsNonAdmin } from "@pinai/domain/models/instance-admin"

export const adminQueryKey = (idpUrl: string | null, resource: "intro" | "members" | "invitations") =>
    ["instance-admin", idpUrl, resource] as const

/** A 403 stands: asking again won't make the account an admin. */
export const retryUnlessRefused = (failures: number, error: unknown) => !refusedAsNonAdmin(error) && failures < 3
