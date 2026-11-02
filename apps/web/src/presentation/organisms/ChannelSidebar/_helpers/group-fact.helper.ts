import type { DmConversation } from "@/lib/types"

/** A group's line under its name: how many are in it, or that the user no longer is. */
export function groupFact(group: Pick<DmConversation, "memberCount" | "removedAt">): string {
    if (group.removedAt != null) return "no longer a member"
    return `${group.memberCount} ${group.memberCount === 1 ? "member" : "members"}`
}
