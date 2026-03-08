import type { FriendRequestResponse, PendingFriendRequest, UserSummary } from "@/domain/models/social"

export interface ISocialPort {
    /** Send a friend request to a user by address. */
    sendFriendRequest(idpUrl: string, accessToken: string, address: string): Promise<FriendRequestResponse>
    /** Fetch all accepted friends (union of sent + received requests). */
    getFriends(idpUrl: string, accessToken: string): Promise<UserSummary[]>
    /** Fetch pending incoming friend requests (for seeding notifications on load). */
    getPendingFriendRequests(idpUrl: string, accessToken: string): Promise<PendingFriendRequest[]>
    /** Accept an incoming friend request. */
    acceptFriendRequest(idpUrl: string, accessToken: string, friendRequestId: string): Promise<void>
    /** Reject an incoming friend request. */
    rejectFriendRequest(idpUrl: string, accessToken: string, friendRequestId: string): Promise<void>
}
